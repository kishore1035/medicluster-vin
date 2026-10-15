// Device-local driver shift state (set at sign-in, cleared when going off duty).
export const VEHICLE_KEY = 'medicluster.driver.vehicleId';
export const EMPLOYEE_KEY = 'medicluster.driver.employeeId';
export const SHIFT_KEY = 'medicluster.driver.shiftStart';

export function clearDriverShift() {
  [SHIFT_KEY].forEach((k) => localStorage.removeItem(k));
}

export function startDriverShift(employeeId, vehicleId) {
  localStorage.setItem(EMPLOYEE_KEY, employeeId);
  localStorage.setItem(VEHICLE_KEY, vehicleId);
  localStorage.setItem(SHIFT_KEY, String(Date.now()));
}
