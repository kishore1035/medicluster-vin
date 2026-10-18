import test from 'node:test';
import assert from 'node:assert/strict';
import { persistAssignment } from '../src/services/assignmentFlow.js';

test('successful dispatch only publishes success after persistence resolves', async () => {
  const events = [];
  let finish;
  const response = new Promise(resolve => { finish = resolve; });
  const payload = { incident_id: 'incident', ambulance_id: 'ambulance', hospital_id: 'hospital' };
  const pending = persistAssignment(async supplied => {
    assert.deepEqual(supplied, payload);
    events.push('requested');
    return response;
  }, payload, data => events.push(data.id));
  assert.deepEqual(events, ['requested']);
  finish({ data: { id: 'persisted-assignment' } });
  assert.deepEqual(await pending, { id: 'persisted-assignment' });
  assert.deepEqual(events, ['requested', 'persisted-assignment']);
});

test('failed assignment never invokes success callback', async () => {
  let published = false;
  await assert.rejects(persistAssignment(async () => { throw new Error('Ambulance no longer available'); }, {}, () => { published = true; }), /no longer available/);
  assert.equal(published, false);
});
