/*
 * Helpers para búsqueda de ubicaciones (Nominatim) y listado de resultados.
 * Usado en páginas con mapas para permitir al usuario seleccionar el lugar exacto.
 */

window.getThemeTileLayer = function getThemeTileLayer(theme = document.documentElement.dataset.theme || 'light') {
    // Leaflet 2D Maps completely removed in favor of CesiumJS 3D Globe
    console.log("Legacy Leaflet getThemeTileLayer called (Disabled).");
    return null;
};

window.watchThemeOnMap = function watchThemeOnMap(map) {
    // Leaflet Theme watcher disabled. Cesium 3D ignores this.
    console.log("Legacy Leaflet watchThemeOnMap called (Disabled).");
};

window.setupMapSearch = function setupMapSearch({
    map,
    searchInput,
    searchBtn,
    resultsContainer,
    onSelectPlace,
    onStatusMessage
}) {
    if (!map || !searchInput || !searchBtn || !resultsContainer) return;

    let lastResults = [];

    function setStatus(text) {
        if (onStatusMessage) onStatusMessage(text);
    }

    function renderResults(places) {
        lastResults = places;
        resultsContainer.innerHTML = '';
        if (!places || places.length === 0) {
            const msg = document.createElement('div');
            msg.className = 'map-search-item text-muted';
            msg.textContent = 'No se encontraron resultados.';
            resultsContainer.appendChild(msg);
            return;
        }

        places.slice(0, 7).forEach((place, index) => {
            const item = document.createElement('div');
            item.className = 'map-search-item';
            item.setAttribute('data-index', index);
            item.innerHTML = `
                <div class="fw-semibold">${place.display_name}</div>
                <div class="small text-muted">Lat ${parseFloat(place.lat).toFixed(4)}, Lon ${parseFloat(place.lon).toFixed(4)}</div>
            `;
            item.addEventListener('click', () => {
                const lat = parseFloat(place.lat);
                const lon = parseFloat(place.lon);
                if (onSelectPlace) onSelectPlace({ lat, lon, place });
                setStatus(`Ubicación seleccionada: ${place.display_name}`);
            });
            resultsContainer.appendChild(item);
        });
    }

    async function search(query) {
        if (!query || !query.trim()) return;
        setStatus('Buscando ubicaciones...');

        try {
            const url = `https://nominatim.openstreetmap.org/search?format=json&limit=10&q=${encodeURIComponent(query)}`;
            const res = await fetch(url);
            const places = await res.json();
            renderResults(places);
            if (!places || places.length === 0) {
                setStatus('No se encontró ninguna ubicación. Prueba otro nombre.');
            } else {
                setStatus(`Resultados encontrados: ${places.length}. Selecciona uno.`);
            }
        } catch (err) {
            setStatus('Error al buscar ubicación. Revisa tu conexión.');
            console.error(err);
        }
    }

    searchBtn.addEventListener('click', () => {
        search(searchInput.value);
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            search(searchInput.value);
        }
    });

    return {
        search,
        renderResults,
        getLastResults: () => lastResults,
    };
};
