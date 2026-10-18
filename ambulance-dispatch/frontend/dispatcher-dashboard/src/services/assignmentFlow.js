// Keep success effects behind the persisted API response for every dispatch path.
export async function persistAssignment(create, payload, onSaved) {
  const response = await create(payload);
  onSaved?.(response.data);
  return response.data;
}
