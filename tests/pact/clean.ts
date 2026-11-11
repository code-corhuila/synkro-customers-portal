import { unlinkSync, existsSync } from 'node:fs';
export default function () {
  const file = 'tests/pact/pacts/CustomersPortal-CustomersAPI.json';
  if (existsSync(file)) unlinkSync(file);
}
