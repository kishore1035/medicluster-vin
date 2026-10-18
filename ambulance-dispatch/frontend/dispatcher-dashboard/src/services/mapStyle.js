// Shared keyless street tiles for dispatch and crew maps. Native resolution ends
// at zoom 19; MapLibre can overscale without requesting nonexistent tile levels.
export const STREET_MAP_STYLE = {
  version: 8,
  sources: {
    'osm-streets': {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    { id: 'osm-streets', type: 'raster', source: 'osm-streets' },
  ],
};
