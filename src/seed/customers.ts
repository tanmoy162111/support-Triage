// Synthetic (mock) customers on reserved .example domains. No real people or companies.
const FIRST = ['Sam', 'Priya', 'Jordan', 'Mei', 'Luis', 'Amara', 'Noah', 'Ivy', 'Omar', 'Zoe', 'Ravi', 'Elena', 'Kai', 'Nina', 'Theo', 'Aisha', 'Ben', 'Chloe', 'Dev', 'Faye', 'Gus', 'Hana', 'Ian', 'Jun', 'Kira'];
const COMPANY = ['acme', 'globex', 'initech', 'umbrella', 'hooli', 'stark', 'wayne', 'wonka', 'tyrell', 'cyberdyne', 'aperture', 'soylent', 'vandelay', 'pied', 'massive', 'oscorp', 'gringotts', 'dunder', 'sterling', 'bluth', 'prestige', 'nakatomi', 'monarch', 'xanadu', 'zorg'];
const PLANS = ['free', 'pro', 'business'];

export const SEED_CUSTOMERS = FIRST.map((name, i) => ({
  name,
  email: `${name.toLowerCase()}@${COMPANY[i]}.example`,
  plan: PLANS[i % PLANS.length],
  accountNotes: '',
}));
