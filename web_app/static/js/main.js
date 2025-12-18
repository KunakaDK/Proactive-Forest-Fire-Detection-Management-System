// --- Configuration Globale ---
const API_PROXY_URL = '/api/proxy';
const MAP_ID = 'mapid';
let map;
let markers = {}; // Stocke les marqueurs Leaflet par ID de nœud
let currentSelectedNodeId = null;
let charts = {}; // Stocke les instances Chart.js par ID de capteur
let sensorMap = {}; // Stocke les capteurs par type { 'temperature': 10, 'humidite': 11, ... }

// --- Fonctions Utilitaires ---

/**
 * Fonction générique pour effectuer des requêtes vers le proxy Flask.
 * @param {string} path - Le chemin de l'API (ex: 'noeuds', 'mesures/statistiques').
 * @param {string} method - La méthode HTTP ('GET', 'POST', 'PUT', 'DELETE').
 * @param {object} data - Les données à envoyer (pour POST/PUT).
 * @param {object} params - Les paramètres de requête (pour GET).
 * @returns {Promise<object>} - La réponse JSON de l'API.
 */
async function apiFetch(path, method = 'GET', data = null, params = null) {
    const url = new URL(`${API_PROXY_URL}/${path}`, window.location.origin);

    if (params) {
        Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
    }

    const options = {
        method: method,
        headers: {
            'X-Requested-With': 'XMLHttpRequest' // Pour aider le backend Flask à identifier les requêtes AJAX
        }
    };

    if (data) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(url, options);

        if (response.status === 401) {
            // Token expiré ou non autorisé, le backend Flask a déjà effacé la session
            alert("Votre session a expiré. Veuillez vous reconnecter.");
            window.location.href = '/login';
            return;
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Erreur API: ${response.status}`);
        }

        return response.json();

    } catch (error) {
        console.error("Erreur lors de la requête API:", error);
        throw error;
    }
}

/**
 * Convertit un statut de nœud en classe CSS.
 * @param {string} statut - Le statut du nœud ('actif', 'alerte', etc.).
 * @returns {string} - La classe CSS correspondante.
 */
function getStatusClass(statut) {
    if (statut && statut.toLowerCase().includes('alerte')) {
        return 'status-alert';
    }
    return 'status-ok';
}

/**
 * Formate une date ISO en format lisible.
 * @param {string} isoDate - La date au format ISO.
 * @returns {string} - La date formatée.
 */
function formatDate(isoDate) {
    if (!isoDate) return 'N/A';
    const date = new Date(isoDate);
    return date.toLocaleString('fr-FR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Convertit une valeur en nombre et la formate avec toFixed.
 * Retourne 'N/A' si la valeur est invalide.
 * @param {*} value - La valeur à formater.
 * @param {number} digits - Le nombre de décimales.
 * @returns {string} - La valeur formatée ou 'N/A'.
 */
function safeToFixed(value, digits) {
    const num = parseFloat(value);
    if (isNaN(num)) {
        return 'N/A';
    }
    return num.toFixed(digits);
}

/**
 * Récupère la liste des capteurs et crée une map {type: id}.
 */
async function fetchSensorMap() {
    try {
        // 1. Récupération de la liste brute depuis l'API
        const sensors = await apiFetch('capteurs');
        
        // 2. Pré-traitement pour créer 'type2' unique
        const typeCounts = {}; // Compteur d'occurrences

        sensors.forEach(sensor => {
            const originalType = sensor.type;

            // On initialise type2 avec la valeur originale
            if (typeCounts[originalType]) {
                // C'est un doublon ! On incrémente
                typeCounts[originalType]++;
                // On crée le nom unique dans type2
                sensor.type2 = `${originalType} ${typeCounts[originalType]}`;
            } else {
                // Premier passage
                typeCounts[originalType] = 1;
                // Le premier garde le nom simple
                sensor.type2 = originalType;
            }
        });

        // 3. Création du mappage en utilisant type2 comme clé
        sensorMap = sensors.reduce((map, sensor) => {
            // Ici on utilise sensor.type2 pour la clé du dictionnaire
            map[sensor.type2] = sensor.id;
            return map;
        }, {});
        //console.log("Carte des capteurs chargée:", sensorMap);
    } catch (error) {
        console.error("Erreur lors du chargement de la carte des capteurs:", error);
    }
}

/**
 * Tente de déduire le type et l'unité d'un capteur à partir de son nom complet.
 * @param {string} nomComplet - Nom complet du capteur (ex: "DHT11 Température").
 * @returns {object|null} - {type, unite} ou null.
 */
function getCapteurInfoFromNom(nomComplet) {
    const nom = nomComplet.toLowerCase();
    
    if (nom.includes('température') && nomComplet.includes('A')) {
        return { type: 'temperature', unite: '°C' };
    }
    if (nom.includes('humidité') && nomComplet.includes('A')) {
        return { type: 'humidite', unite: '%' };
    }
    if (nom.includes('fumée') && nomComplet.includes('A')) {
        return { type: 'fumee', unite: 'PPM' };
    }
    if (nom.includes('flamme') && nomComplet.includes('A')) {
        return { type: 'flamme', unite: 'bool' };
    }
    if (nom.includes('température') && nomComplet.includes('B')) {
        return { type: 'temperature 2', unite: '°C' };
    }
    if (nom.includes('humidité') && nomComplet.includes('B')) {
        return { type: 'humidite 2', unite: '%' };
    }
    if (nom.includes('fumée') && nomComplet.includes('B')) {
        return { type: 'fumee 2', unite: 'PPM' };
    }
    if (nom.includes('flamme') && nomComplet.includes('B')) {
        return { type: 'flamme 2', unite: 'bool' };
    }
    
    return null;
}

// --- Logique du Tableau de Bord (index.html) ---

/**
 * Initialise la carte Leaflet.
 */
function initMap() {
    if (document.getElementById(MAP_ID)) {
        map = L.map(MAP_ID).setView([45.0, 2.0], 6); // Centré sur la France
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: ''
        }).addTo(map);
    }
}

/**
 * Récupère et affiche la liste des nœuds.
 */
async function fetchNodes() {
    try {
        const noeuds = await apiFetch('noeuds');
        const nodes = noeuds.filter(node => node.statut === "actif");
        const nodeList = document.getElementById('node-list');
        nodeList.innerHTML = ''; // Vider la liste

        // --- Correction 1: Filtrage des Alertes (24h) pour les stats ---
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        // L'API 'alertes/logs' supporte date_debut, ce qui est utilisé ici.
        const alertLogs = await apiFetch('alertes/logs?limit=10', 'GET', null, 'oneDayAgo');
        const alertCount = alertLogs.length;

        nodes.forEach(node => {
            // 1. Mise à jour de la liste latérale
            const listItem = document.createElement('li');
            const statusClass = getStatusClass(node.statut);
            listItem.className = `node-item ${statusClass}`;
            listItem.setAttribute('data-node-id', node.id);
            listItem.innerHTML = `
                <span class="status-indicator ${statusClass}"></span>
                <span class="node-name">${node.nom}</span>
            `;
            listItem.onclick = () => selectNode(node.id);
            nodeList.appendChild(listItem);

            // 2. Mise à jour de la carte
            if (node.localisation) {
                // Supposons que la localisation est au format "lat, lon"
                const [lat, lon] = node.localisation.split(',').map(c => parseFloat(c.trim()));
                if (!isNaN(lat) && !isNaN(lon)) {
                    const markerColor = statusClass === 'status-alert' ? 'red' : 'blue';
                    const customIcon = L.divIcon({
                        className: 'custom-marker',
                        html: `<div style="background-color: ${markerColor}; width: 15px; height: 15px; border-radius: 50%; border: 2px solid white;"></div>`,
                        iconSize: [15, 15],
                        iconAnchor: [7, 7]
                    });

                    const marker = L.marker([lat, lon], { icon: customIcon }).addTo(map);
                    marker.bindPopup(`<b>${node.nom}</b><br>Statut: ${node.statut}<br><a href="#" onclick="selectNode(${node.id}); return false;">Voir les détails</a>`);
                    marker.on('click', () => selectNode(node.id));
                    markers[node.id] = marker;
                }
            }
        });

        // Mise à jour des statistiques globales
        document.getElementById('stat-nodes').textContent = nodes.length;
        document.getElementById('stat-alerts').textContent = alertCount;
        // La stat de température moyenne nécessite un appel API supplémentaire si non disponible dans /dashboard/summary
        // Pour l'instant, on laisse N/A ou on utilise une stat existante si elle est fournie par l'API.

    } catch (error) {
        console.error("Erreur lors du chargement des nœuds ou des alertes:", error);
        document.getElementById('node-list').innerHTML = '<li class="error-item">Erreur de chargement des nœuds.</li>';
        document.getElementById('stat-alerts').textContent = 'Erreur';
    }
}

/**
 * Sélectionne un nœud et affiche ses détails.
 * @param {number} nodeId - L'ID du nœud sélectionné.
 */
async function selectNode(nodeId) {
    // Désélectionner l'ancien nœud
    if (currentSelectedNodeId) {
        document.querySelector(`.node-item[data-node-id="${currentSelectedNodeId}"]`)?.classList.remove('selected');
    }

    // Sélectionner le nouveau nœud
    currentSelectedNodeId = nodeId;
    document.querySelector(`.node-item[data-node-id="${nodeId}"]`)?.classList.add('selected');

    const detailsContent = document.getElementById('details-content');
    const nodeCharts = document.getElementById('node-charts');
    const detailsTitle = document.getElementById('details-title');
    const metaIp = document.getElementById('meta-ip');
    const metaMac = document.getElementById('meta-mac');
    const statut = document.getElementById('statut');
    const capteurs = document.getElementById('capteurs');
    const metaLastSeen = document.getElementById('meta-last-seen');

    detailsTitle.textContent = `Détails du Nœud #${nodeId}`;
    detailsContent.innerHTML = '<p>Chargement des détails...</p>';
    nodeCharts.style.display = 'none';
    

    try {
        // 1. Récupérer les détails du nœud (pour les métadonnées)
        const nodeDetails = await apiFetch(`noeuds/${nodeId}`);
        // 2. Récupérer les statistiques (Min/Max/Moy)
        const stats = await apiFetch('mesures/statistiques', 'GET', null, { noeud_id: nodeId });

        // --- Correction 2 & 3: Gestion dynamique des capteurs et graphiques ---
        const capteursAssociesNoms = nodeDetails.capteurs ? nodeDetails.capteurs.split(',').map(c => c.trim()) : [];
        const capteursDuNoeud = [];
        
        // 3. Identifier les capteurs réels du nœud avec leurs IDs globaux
        capteursAssociesNoms.forEach(capteurNomComplet => {
            const capteurInfo = getCapteurInfoFromNom(capteurNomComplet);
            if (capteurInfo) {
                const capteurId = sensorMap[capteurInfo.type];
                if (capteurId) {
                    capteursDuNoeud.push({
                        id: capteurId,
                        nom: capteurNomComplet,
                        type: capteurInfo.type,
                        unite: capteurInfo.unite
                    });
                }
                else {
                    capteursDuNoeud.push({
                        id: 119,
                        nom: capteurNomComplet,
                        type: capteurInfo.type,
                        unite: capteurInfo.unite
                    });
                }
            }
        });
        // 4. Récupérer les mesures pour les graphiques (historique)
        const historyPromises = [];
        capteursDuNoeud.forEach(capteur => {
            // Utilisation de l'ID du capteur et de l'intervalle 'heure' sur 24 périodes (24h)
            historyPromises.push(apiFetch('mesures/historique', 'GET', null, { 
                capteur_id: capteur.id, 
                intervalle: 'heure', 
                limit: 24 
            }));
        });
        
        const historyResults = await Promise.all(historyPromises);

        
        // 5. Affichage des détails et des graphiques
        /*let detailsHTML = `
            <p><strong>Adresse MAC:</strong> ${nodeDetails.adresse_mac}</p>
            <p><strong>Adresse IP:</strong> ${nodeDetails.adresse_ip}</p>
            <p><strong>Statut:</strong> ${nodeDetails.statut}</p>
            <p><strong>Dernière Connexion:</strong> ${formatDate(nodeDetails.derniere_connexion)}</p>
            <p><strong>Capteurs Installés:</strong> ${nodeDetails.capteurs}</p>
            <hr>
            <h4>Statistiques Récentes (Min/Moy/Max)</h4>
        `;
        
        // Affichage des statistiques
        stats.forEach(stat => {
            detailsHTML += `
                <p>
                    <strong>${stat.capteur_nom}:</strong> 
                    Min: ${safeToFixed(stat.minimum, 1)} ${stat.unite} | 
                    Moy: ${safeToFixed(stat.moyenne, 1)} ${stat.unite} | 
                    Max: ${safeToFixed(stat.maximum, 1)} ${stat.unite}
                </p>
            `;
        });
        
        detailsContent.innerHTML = detailsHTML;
        */
        // --- Affichage des Métadonnées ---
        // Le code original utilisait des IDs spécifiques pour les éléments HTML.
        // Assurez-vous que ces IDs existent dans index.html
        detailsContent.innerHTML = '';
        metaIp.textContent = nodeDetails.adresse_ip || 'N/A';
        metaMac.textContent = nodeDetails.adresse_mac || 'N/A';
        statut.textContent = nodeDetails.statut || 'N/A';
        metaLastSeen.textContent = formatDate(nodeDetails.derniere_connexion);
        let capteursInnerHtml = '<ul class="metadataUl">';
        capteursAssociesNoms.forEach(capteurNomComplet => {
            capteursInnerHtml += `
                <li>${capteurNomComplet}</li>
            `;
        });
        capteurs.innerHTML = capteursInnerHtml + '</ul>';
        
        /*// Affichage des statistiques
        stats.forEach(stat => {
            detailsHTML += `
                <p>
                    <strong>${stat.capteur_nom}:</strong> 
                    Min: ${safeToFixed(stat.minimum, 1)} ${stat.unite} | 
                    Moy: ${safeToFixed(stat.moyenne, 1)} ${stat.unite} | 
                    Max: ${safeToFixed(stat.maximum, 1)} ${stat.unite}
                </p>
            `;
        });
        
        detailsContent.innerHTML = detailsHTML;*/

        // --- Affichage des Statistiques Avancées ---
        const statsSummary = document.getElementById('stats-summary');
        statsSummary.innerHTML = '';
        stats.forEach(stat => {
            const statItem = document.createElement('div');
            statItem.className = 'stat-item';
            statItem.innerHTML = `
                <p class="statItemTitle">${stat.capteur_nom} (${stat.unite}):</p>
                <p class="statItemElement">Moy: <strong>${safeToFixed(stat.moyenne, 2)}</strong></p>
                <p class="statItemElement">Min: <strong>${safeToFixed(stat.minimum, 2)}</strong></p>
                <p class="statItemElement">Max: <strong>${safeToFixed(stat.maximum, 2)}</strong></p>
            `;
            statsSummary.appendChild(statItem);
        });
        if (statsSummary.innerHTML == '') {
            statsSummary.innerHTML = "<p>Statistiques Indisponibles<br>Le noeud n'a jamais été connecté !</p>"
        }
        // 6. Mise à jour des graphiques
        const chartContainer = document.getElementById('node-charts-container');
        chartContainer.innerHTML = ''; // Vider les anciens graphiques
        historyResults.forEach((history, index) => {
            history.reverse();
            const capteur = capteursDuNoeud[index];

            
            // Créer un canvas pour chaque capteur
            const chartWrapper = document.createElement('div');
            chartWrapper.className = 'chart-wrapper';
            chartWrapper.innerHTML = `<h4>${capteur.nom} (${capteur.unite})</h4><canvas id="chart-${capteur.id}"></canvas>`;
            chartContainer.appendChild(chartWrapper);
            const labels = history.map(h => new Date(h.periode).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
            const dataValues = history.map(h => h.moyenne); // Utiliser la moyenne agrégée
            
            const ctx = document.getElementById(`chart-${capteur.id}`).getContext('2d');
            
            // Détruire l'ancienne instance si elle existe
            if (charts[capteur.id]) {
                charts[capteur.id].destroy();
            }
            charts[capteur.id] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: `${capteur.nom} (${capteur.unite})`,
                        data: dataValues,
                        borderColor: capteur.type === 'temperature' ? 'rgb(255, 99, 132)' : (capteur.type === 'fumee' ? 'rgb(75, 192, 192)' : 'rgb(54, 162, 235)'),
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: {
                            beginAtZero: capteur.type !== 'temperature' // Température peut être négative
                        }
                    }
                }
            });
        });
        
        nodeCharts.style.display = 'block';
        
        // 7. Récupérer les alertes spécifiques au nœud (filtrées sur 24h)
        // --- Correction 1: Filtrage des Alertes (24h) pour les détails du nœud ---
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const nodeAlerts = await apiFetch('alertes/logs?limit=10', 'GET', null, { noeud_id: nodeId, date_debut: oneDayAgo });
        
        const alertsList = document.getElementById('node-alerts-list');
        alertsList.innerHTML = '';
        
        if (nodeAlerts.length > 0) {
            nodeAlerts.forEach(alert => {
                const listItem = document.createElement('li');
                listItem.className = `alert-item alert-${alert.severite.toLowerCase()}`;
                listItem.innerHTML = `
                    <strong>${alert.severite}</strong> - ${alert.alerte_message} (${alert.valeur_mesuree} ${alert.unite || ''})
                    <span class="alert-timestamp">${formatDate(alert.timestamp)}</span>
                `;
                alertsList.appendChild(listItem);
            });
        } else {
            alertsList.innerHTML = '<li class="no-alert">Aucune alerte récente pour ce nœud.</li>';
        }

        // Centrer la carte sur le nœud sélectionné
        if (nodeDetails.localisation) {
            const [lat, lon] = nodeDetails.localisation.split(',').map(c => parseFloat(c.trim()));
            if (!isNaN(lat) && !isNaN(lon)) {
                map.setView([lat, lon], 13);
                markers[nodeId]?.openPopup();
            }
        }
        
        
    } catch (error) {
        console.error("Erreur lors du chargement des détails du nœud:", error);
        detailsContent.innerHTML = `<p class="error-message">Erreur lors du chargement des détails: ${error.message}</p>`;
        nodeCharts.style.display = 'none';
    }
}


/**
 * Ferme le panneau de détails.
 */
function closeDetailsPanel() {
    currentSelectedNodeId = null;
    document.getElementById('details-title').textContent = 'Sélectionnez un Nœud';
    document.getElementById('details-content').innerHTML = '<p>Cliquez sur un marqueur sur la carte ou sur un nœud dans la liste pour afficher les détails.</p>';
    document.getElementById('node-charts').style.display = 'none';
    document.querySelectorAll('.node-item').forEach(item => item.classList.remove('selected'));
}

// --- Logique de la Page Administration (admin.html) ---

/**
 * Ouvre un onglet dans la page d'administration.
 * @param {Event} evt - L'événement de clic.
 * @param {string} tabName - L'ID de l'onglet à ouvrir.
 */
function openTab(evt, tabName) {
    // Déclarer toutes les variables
    let i, tabcontent, tablinks;

    // Cacher tous les contenus d'onglet
    tabcontent = document.getElementsByClassName("tab-content");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }

    // Retirer la classe "active" de tous les boutons d'onglet
    tablinks = document.getElementsByClassName("tab-button");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }

    // Afficher l'onglet courant et ajouter la classe "active" au bouton
    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.className += " active";

    // Charger les données de l'onglet
    if (tabName === 'users-tab') {
        fetchUsers();
    } else if (tabName === 'nodes-tab') {
        fetchAdminNodes();
    }
}

/**
 * Récupère et affiche la liste des utilisateurs.
 */
async function fetchUsers() {
    const tableBody = document.querySelector('#users-tab tbody');
    tableBody.innerHTML = '<tr><td colspan="7">Chargement des utilisateurs...</td></tr>';

    try {
        const users = await apiFetch('utilisateurs');
        tableBody.innerHTML = '';

        users.forEach(user => {
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${user.id}</td>
                <td>${user.username}</td>
                <td>${user.email}</td>
                <td>${user.role}</td>
                <td>${user.actif ? 'Oui' : 'Non'}</td>
                <td>${formatDate(user.derniere_connexion)}</td>
                <td>
                    <button class="btn-secondary action-btn" onclick="toggleUserActive(${user.id}, ${user.actif})">${user.actif ? 'Désactiver' : 'Activer'}</button>
                    <button class="btn-danger action-btn" onclick="deleteUser(${user.id})">Supprimer</button>
                </td>
            `;
        });
    } catch (error) {
        tableBody.innerHTML = `<tr><td colspan="7" class="error-message">Erreur de chargement des utilisateurs: ${error.message}</td></tr>`;
    }
}

/**
 * Ouvre la modale pour créer un nouvel utilisateur.
 */
function openCreateUserModal() {
    document.getElementById('modal-title').textContent = 'Créer un Nouvel Utilisateur';
    document.getElementById('user-id').value = '';
    document.getElementById('new-username').value = '';
    document.getElementById('new-email').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('new-role').value = 'user';
    document.getElementById('modal-submit-btn').textContent = 'Créer';
    document.getElementById('user-modal').style.display = 'block';
}

/**
 * Ferme la modale.
 * @param {string} modalId - L'ID de la modale.
 */
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

/**
 * Ouvre la modale pour créer un nouveau nœud.
 */
function openCreateNodeModal() {
    document.getElementById('node-modal-title').textContent = 'Créer un Nouveau Nœud';
    document.getElementById('node-id').value = '';
    document.getElementById('node-name').value = '';
    document.getElementById('node-mac').value = '';
    document.getElementById('node-ip').value = '';
    document.getElementById('node-localisation').value = '';
    document.getElementById('node-statut').value = 'actif';
    document.getElementById('node-modal-submit-btn').textContent = 'Créer';
    document.getElementById('node-modal').style.display = 'block';
}

/**
 * Ouvre la modale pour éditer un nœud existant.
 * @param {number} nodeId - L'ID du nœud à éditer.
 */
async function openEditNodeModal(nodeId) {
    try {
        const nodeDetails = await apiFetch(`noeuds/${nodeId}`);
        
        document.getElementById('node-modal-title').textContent = `Modifier le Nœud #${nodeId}`;
        document.getElementById('node-id').value = nodeId;
        document.getElementById('node-name').value = nodeDetails.nom || '';
        document.getElementById('node-mac').value = nodeDetails.adresse_mac || '';
        document.getElementById('node-ip').value = nodeDetails.adresse_ip || '';
        document.getElementById('node-localisation').value = nodeDetails.localisation || '';
        document.getElementById('node-statut').value = nodeDetails.statut || 'actif';
        document.getElementById('node-modal-submit-btn').textContent = 'Modifier';
        document.getElementById('node-modal').style.display = 'block';

    } catch (error) {
        alert(`Erreur lors du chargement des détails du nœud: ${error.message}`);
    }
}

/**
 * Gère la soumission du formulaire de création/édition d'utilisateur.
 */
document.addEventListener('DOMContentLoaded', () => {
    const userForm = document.getElementById('user-form');
    if (userForm) {
        userForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('new-username').value;
            const email = document.getElementById('new-email').value;
            const password = document.getElementById('new-password').value;
            const role = document.getElementById('new-role').value;
            
            const data = { username, email, role };
            if (password) {
                data.password = password;
            }

            try {
                // Création d'utilisateur
                await apiFetch('auth/register', 'POST', data);
                alert('Utilisateur créé avec succès.');
                closeModal('user-modal');
                fetchUsers(); // Recharger la liste
            } catch (error) {
                alert(`Erreur lors de la création de l'utilisateur: ${error.message}`);
            }
        });
    }

    const nodeForm = document.getElementById('node-form');
    if (nodeForm) {
        nodeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nodeId = document.getElementById('node-id').value;
            const nom = document.getElementById('node-name').value;
            const adresse_mac = document.getElementById('node-mac').value;
            const adresse_ip = document.getElementById('node-ip').value;
            const localisation = document.getElementById('node-localisation').value;
            const statut = document.getElementById('node-statut').value;

            const data = { nom, adresse_mac, adresse_ip, localisation, statut };
            
            try {
                if (nodeId) {
                    // Édition de nœud (PUT)
                    await apiFetch(`noeuds/${nodeId}`, 'PUT', data);
                    alert(`Nœud #${nodeId} modifié avec succès.`);
                } else {
                    // Création de nœud (POST)
                    await apiFetch('noeuds', 'POST', data);
                    alert('Nœud créé avec succès.');
                }
                closeModal('node-modal');
                fetchAdminNodes(); // Recharger la liste d'administration
                fetchNodes(); // Recharger la liste du dashboard
            } catch (error) {
                alert(`Erreur lors de la gestion du nœud: ${error.message}`);
            }
        });
    }
});

/**
 * Active ou désactive un utilisateur.
 * @param {number} userId - L'ID de l'utilisateur.
 * @param {boolean} currentStatus - Le statut actuel.
 */
async function toggleUserActive(userId, currentStatus) {
    if (!confirm(`Voulez-vous vraiment ${currentStatus ? 'désactiver' : 'activer'} l'utilisateur #${userId}?`)) {
        return;
    }
    try {
        await apiFetch(`utilisateurs/${userId}`, 'PUT', { actif: !currentStatus });
        alert(`Utilisateur #${userId} ${currentStatus ? 'désactivé' : 'activé'} avec succès.`);
        fetchUsers();
    } catch (error) {
        alert(`Erreur lors de la mise à jour de l'utilisateur: ${error.message}`);
    }
}

/**
 * Supprime un utilisateur.
 * @param {number} userId - L'ID de l'utilisateur.
 */
async function deleteUser(userId) {
    if (!confirm(`Voulez-vous vraiment supprimer l'utilisateur #${userId}? Cette action est irréversible.`)) {
        return;
    }
    try {
        await apiFetch(`utilisateurs/${userId}`, 'DELETE');
        alert(`Utilisateur #${userId} supprimé avec succès.`);
        fetchUsers();
    } catch (error) {
        alert(`Erreur lors de la suppression de l'utilisateur: ${error.message}`);
    }
}

/**
 * Récupère et affiche la liste des nœuds pour l'administration.
 */
async function fetchAdminNodes() {
    const tableBody = document.querySelector('#admin-nodes-table tbody');
    tableBody.innerHTML = '<tr><td colspan="6">Chargement des nœuds...</td></tr>';

    try {
        const nodes = await apiFetch('noeuds');
        tableBody.innerHTML = '';

        nodes.forEach(node => {
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${node.id}</td>
                <td>${node.nom}</td>
                <td>${node.adresse_mac || 'N/A'}</td>
                <td>${node.adresse_ip || 'N/A'}</td>
                <td>${node.statut || 'N/A'}</td>
                <td>
                    <button class="btn-secondary action-btn" onclick="editNode(${node.id})">Modifier</button>
                    <button class="btn-danger action-btn" onclick="deleteNode(${node.id})">Supprimer</button>
                </td>
            `;
        });
    } catch (error) {
        tableBody.innerHTML = `<tr><td colspan="6" class="error-message">Erreur de chargement des nœuds: ${error.message}</td></tr>`;
    }
}

/**
 * Fonction placeholder pour l'édition de nœud (PUT /noeuds/{id}).
 * @param {number} nodeId - L'ID du nœud.
 */
function editNode(nodeId) {
    openEditNodeModal(nodeId);
}

/**
 * Fonction placeholder pour la suppression de nœud (DELETE /noeuds/{id}).
 * @param {number} nodeId - L'ID du nœud.
 */
async function deleteNode(nodeId) {
    if (!confirm(`Voulez-vous vraiment supprimer le nœud #${nodeId}?`)) {
        return;
    }
    try {
        await apiFetch(`noeuds/${nodeId}`, 'DELETE');
        alert(`Nœud #${nodeId} supprimé avec succès.`);
        fetchAdminNodes();
        fetchNodes(); // Mettre à jour le tableau de bord
    } catch (error) {
        alert(`Erreur lors de la suppression du nœud: ${error.message}`);
    }
}

// Ajouter la fonction d'affichage des alertes ici (à implémenter)
function displayNodeAlerts(alerts) {
    const alertsContainer = document.getElementById('node-alerts-container');
    if (!alertsContainer) return;

    if (alerts.length === 0) {
        alertsContainer.innerHTML = '<p class="no-alerts">Aucune alerte récente pour ce nœud.</p>';
        return;
    }

    alertsContainer.innerHTML = '<ul>' + alerts.map(alert => `
        <li class="alert-item alert-${alert.severite.toLowerCase()}">
            <span class="alert-timestamp">${formatDate(alert.timestamp)}</span>
            <span class="alert-message">${alert.alerte_message} (${alert.severite})</span>
            <span class="alert-value">Valeur: ${safeToFixed(alert.valeur_mesuree, 2)}</span>
        </li>
    `).join('') + '</ul>';
}


const nodeListContainer = document.getElementById('node-list-container');
const content = document.getElementsByClassName('content')[0];
const nodeAlertsList = document.getElementById('node-alerts-list');

content.addEventListener('scroll', () => {
    if (content.scrollTop < (nodeAlertsList.offsetTop))
    nodeListContainer.style.top = `${content.scrollTop}px`;
});


// --- Initialisation ---

document.addEventListener('DOMContentLoaded', () => {

    // Vérifier si nous sommes sur la page d'administration
    if (document.getElementById('users-tab')) {
        // Initialiser le premier onglet
        document.getElementById('users-tab').style.display = 'block';
        document.querySelector('.tab-button').classList.add('active');
        fetchUsers();
    }
});

async function initDashboard() {
    initMap();
    await fetchSensorMap(); // Doit être fait avant de charger les nœuds
    await fetchNodes();
    
    // Charger les détails du premier nœud par défaut
    const firstNode = document.querySelector('.node-item');
    if (firstNode) {
        selectNode(parseInt(firstNode.getAttribute('data-node-id')));
    }
}

// Déclenchement de l'initialisation
if (document.getElementById('dashboard-container')) {
    initDashboard();
}
