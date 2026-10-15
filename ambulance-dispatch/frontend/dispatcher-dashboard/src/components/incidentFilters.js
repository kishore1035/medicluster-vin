// Incident list views, in tab order.
const MOVING = ['DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING'];

export const FILTERS = [
  { key: 'all',     label: 'All',      test: (i) => !['RESOLVED', 'CANCELLED'].includes(i.status) },
  { key: 'pending', label: 'Pending',  test: (i) => ['PENDING', 'ACKNOWLEDGED'].includes(i.status) },
  { key: 'enroute', label: 'En route', test: (i) => MOVING.includes(i.status) },
];
