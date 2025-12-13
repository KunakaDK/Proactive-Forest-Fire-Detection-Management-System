import os
import requests
from flask import Flask, render_template, request, redirect, url_for, session, jsonify, abort

# --- Configuration ---
# L'URL de base de l'API distante fournie dans la documentation
#API_BASE_URL = "http://10.55.112.100:5000/api"
API_BASE_URL = "http://192.168.1.100:5000/api"

app = Flask(__name__)
# Clé secrète pour la gestion des sessions Flask (doit être changée en production)
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'super_secret_key_pour_dev')
# Le token JWT sera stocké dans la session Flask
TOKEN_SESSION_KEY = 'jwt_token'
USER_SESSION_KEY = 'user_info'

# --- Fonctions Utilitaires ---

def get_auth_headers():
    """Retourne les headers d'autorisation avec le token JWT de la session."""
    token = session.get(TOKEN_SESSION_KEY)
    if token:
        return {"Authorization": f"Bearer {token}"}
    return {}

def proxy_request(method, path, data=None, params=None):
    """
    Fonction générique pour agir comme proxy entre le frontend et l'API distante.
    Gère l'ajout du token JWT et la gestion des erreurs 401.
    """
    url = f"{API_BASE_URL}{path}"
    headers = get_auth_headers()
    
    try:
        if method == 'GET':
            response = requests.get(url, headers=headers, params=params)
        elif method == 'POST':
            response = requests.post(url, headers=headers, json=data, params=params)
        elif method == 'PUT':
            response = requests.put(url, headers=headers, json=data, params=params)
        elif method == 'DELETE':
            response = requests.delete(url, headers=headers, params=params)
        else:
            # Méthode non supportée par le proxy
            return jsonify({"error": "Method not allowed"}), 405

        # Gestion de l'expiration du token (401 Unauthorized)
        if response.status_code == 401:
            # Déconnexion de l'utilisateur si le token est invalide ou expiré
            if path != '/auth/login': # Ne pas déconnecter si c'est la tentative de login elle-même
                session.pop(TOKEN_SESSION_KEY, None)
                session.pop(USER_SESSION_KEY, None)
                # Pour les requêtes AJAX, renvoyer un statut 401 pour que le JS redirige
                if request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                    return jsonify({"error": "Session expired or unauthorized"}), 401
                # Pour les requêtes de page, rediriger vers le login
                return redirect(url_for('login'))

        # Renvoyer la réponse de l'API telle quelle au frontend
        return response.json(), response.status_code

    except requests.exceptions.RequestException as e:
        # Gérer les erreurs de connexion (VM éteinte, réseau, etc.)
        print(f"Erreur de connexion à l'API distante: {e}")
        return jsonify({"error": "Impossible de se connecter à l'API distante."}), 503

# --- Middlewares et Décorateurs ---

def login_required(f):
    """Décorateur pour s'assurer que l'utilisateur est connecté."""
    def decorated_function(*args, **kwargs):
        if TOKEN_SESSION_KEY not in session:
            return redirect(url_for('login', next=request.url))
        return f(*args, **kwargs)
    decorated_function.__name__ = f.__name__ # Nécessaire pour Flask
    return decorated_function

def role_required(role):
    """Décorateur pour s'assurer que l'utilisateur a le rôle requis."""
    def decorator(f):
        @login_required
        def decorated_function(*args, **kwargs):
            user_info = session.get(USER_SESSION_KEY, {})
            user_role = user_info.get('role')
            
            # Simple vérification de rôle (peut être améliorée pour gérer la hiérarchie)
            if user_role != role:
                # Si l'utilisateur n'a pas le rôle, on lui interdit l'accès
                return render_template('403.html'), 403 # Créer un template 403 plus tard
            return f(*args, **kwargs)
        decorated_function.__name__ = f.__name__ # Nécessaire pour Flask
        return decorated_function
    return decorator

# --- Routes d'Authentification ---

@app.route('/login', methods=['GET', 'POST'])
def login():
    """Gère la page de connexion et l'appel à /api/auth/login."""
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        login_data = {"username": username, "password": password}
        
        # Appel direct à l'API pour le login (pas de proxy pour cette route)
        try:
            response = requests.post(f"{API_BASE_URL}/auth/login", json=login_data)
            
            if response.status_code == 200:
                data = response.json()
                # Stocker le token et les infos utilisateur dans la session
                session[TOKEN_SESSION_KEY] = data.get('token')
                session[USER_SESSION_KEY] = data.get('user')
                
                # Redirection vers la page d'accueil
                next_url = request.args.get('next') or url_for('index')
                return redirect(next_url)
            else:
                # Gérer les erreurs de l'API (401, 400, etc.)
                error_message = response.json().get('message', 'Erreur de connexion inconnue.')
                return render_template('login.html', error=error_message), 401
                
        except requests.exceptions.RequestException:
            return render_template('login.html', error="Erreur de connexion au serveur API."), 503

    return render_template('login.html')

@app.route('/logout')
def logout():
    """Déconnecte l'utilisateur en effaçant la session."""
    session.pop(TOKEN_SESSION_KEY, None)
    session.pop(USER_SESSION_KEY, None)
    return redirect(url_for('login'))

# --- Routes de l'Application ---

@app.route('/')
@login_required
def index():
    """Route pour le tableau de bord (Dashboard)."""
    user_role = session.get(USER_SESSION_KEY, {}).get('role', 'readonly')
    return render_template('index.html', user_role=user_role)

@app.route('/admin')
@role_required('admin')
def admin():
    """Route pour la page d'administration (réservée aux admins)."""
    return render_template('admin.html')

# --- Routes Proxy API (Pour les appels AJAX du Frontend) ---

@app.route('/api/proxy/<path:api_path>', methods=['GET', 'POST', 'PUT', 'DELETE'])
@login_required
def api_proxy(api_path):
    """
    Route générique pour proxifier les requêtes du frontend vers l'API distante.
    Le frontend appellera /api/proxy/noeuds ou /api/proxy/mesures/statistiques, etc.
    """
    # Le chemin complet de l'API est reconstruit
    full_path = f"/{api_path}"
    
    # Récupérer les données (JSON pour POST/PUT, params pour GET)
    # Récupérer les données (JSON pour POST/PUT). Éviter request.get_json() pour GET
    data = None
    if request.method in ['POST', 'PUT', 'DELETE'] and request.is_json:
        # Utiliser silent=True pour éviter l'erreur 400 si le corps est vide ou invalide
        data = request.get_json(silent=True)
    params = request.args.to_dict() if request.method == 'GET' else None
    
    # Exécuter la requête via la fonction proxy
    response_data, status_code = proxy_request(request.method, full_path, data=data, params=params)
    
    # Renvoyer la réponse au frontend
    return jsonify(response_data), status_code

# --- Démarrage de l'Application ---

if __name__ == '__main__':
    # Pour le développement, on peut utiliser un port différent si besoin
    app.run(debug=True, port=5001) # Utilisation du port 5001 pour éviter un conflit avec l'API distante sur 5000
