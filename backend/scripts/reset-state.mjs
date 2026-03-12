import { resetState } from '../lib/state-store.mjs';

async function main() {
  const state = await resetState();
  console.log(`reset backend state: ${state.students.length} students, ${state.assignments.length} assignments, ${state.attempts.length} attempts`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
