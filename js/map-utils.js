/*
 * Helpers para búsqueda de ubicaciones (Nominatim) y listado de resultados.
 * Usado en páginas con mapas para permitir al usuario seleccionar el lugar exacto.
 */

window.getThemeTileLayer = function getThemeTileLayer(theme = document.documentElement.dataset.theme || 'light') {
    const isDark = theme === 'dark';
    const url = isDark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    const attribution = isDark
        ? '&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; OpenStreetMap contributors'
        : '&copy; OpenStreetMap contributors';

    return L.tileLayer(url, {
        attribution,
        maxZoom: 19,
        subdomains: 'abcd',
    });
};

window.watchThemeOnMap = function watchThemeOnMap(map) {
    if (!map || !map.getContainer) return;

    const applyCurrent = () => {
        const newLayer = getThemeTileLayer();
        if (map._themeLayer) {
            map.removeLayer(map._themeLayer);
        }
        map._themeLayer = newLayer.addTo(map);
    };

    // Apply immediately and keep in sync with theme changes.
    applyCurrent();

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.attributeName === 'data-theme') {
                applyCurrent();
                break;
            }
        }
    });

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // Store observer to allow cleanup if needed.
    map._themeObserver = observer;
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
