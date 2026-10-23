// Central API URL resolver: When running on GitHub Pages, proxy API requests to the live Cloud Run backend
export const API_BASE_URL =
  typeof window !== 'undefined' &&
  (window.location.hostname.endsWith('github.io') || window.location.hostname.includes('github'))
    ? 'https://ais-pre-oup32vxwo3nz2n4vroqbmh-579173566500.europe-west2.run.app'
    : '';
