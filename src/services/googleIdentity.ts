export interface GoogleCredentialResponse { credential: string; state?: string }
export interface GoogleIdentitySdk {
  initialize(options: { client_id: string; callback: (response: GoogleCredentialResponse) => void; auto_select: boolean; ux_mode: 'popup' }): void;
  renderButton(element: HTMLElement, options: { type: 'standard'; theme: 'outline'; size: 'large'; text: 'continue_with'; shape: 'rectangular'; locale: string; width: number; state: string; click_listener: () => void }): void;
  disableAutoSelect(): void;
  cancel(): void;
}
declare global { interface Window { google?: { accounts: { id: GoogleIdentitySdk } } } }
let loading: Promise<GoogleIdentitySdk> | undefined;
let initializedClient = '';
const listeners = new Map<string, (response: GoogleCredentialResponse) => void>();

function loadSdk(): Promise<GoogleIdentitySdk> {
  if (window.google?.accounts.id) return Promise.resolve(window.google.accounts.id);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client?hl=vi';
    script.async = true;
    const timer = setTimeout(() => fail(), 10000);
    const fail = () => { clearTimeout(timer); script.remove(); loading = undefined; reject(new Error('Không thể kết nối Google. Bạn vẫn có thể dùng mã phòng.')); };
    script.onerror = fail;
    script.onload = () => { clearTimeout(timer); const sdk = window.google?.accounts.id; if (sdk) resolve(sdk); else fail(); };
    document.head.appendChild(script);
  });
  return loading;
}

export async function mountGoogleButton(element: HTMLElement, clientId: string, state: string, onCredential: (response: GoogleCredentialResponse) => void, onClick: () => void): Promise<() => void> {
  const sdk = await loadSdk();
  if (initializedClient !== clientId) {
    listeners.clear();
    sdk.initialize({ client_id: clientId, auto_select: false, ux_mode: 'popup', callback: response => { if (response.state) listeners.get(response.state)?.(response); } });
    initializedClient = clientId;
  }
  listeners.set(state, onCredential);
  try { sdk.renderButton(element, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', locale: 'vi', width: Math.min(400, element.clientWidth || 280), state, click_listener: onClick }); } catch (error) { listeners.delete(state); element.replaceChildren(); throw error; }
  return () => { listeners.delete(state); element.replaceChildren(); };
}

export function signOutGoogle() {
  listeners.clear();
  if (typeof window !== 'undefined') { window.google?.accounts.id.cancel(); window.google?.accounts.id.disableAutoSelect(); }
}
