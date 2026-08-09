import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const localDevelopment = ['localhost', '127.0.0.1'].includes(window.location.hostname);

if (localDevelopment) {
    window.dashboardSignOut = async () => window.location.assign('index.html');
    document.body.classList.remove('auth-pending');
} else {
    const app = getApps()[0] || initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    window.dashboardSignOut = async () => {
        await signOut(auth);
        window.location.assign('index.html');
    };

    onAuthStateChanged(auth, async user => {
        try {
            if (!user?.email) throw new Error('Sessão não autenticada.');

            const authorization = await getDoc(doc(db, 'usuarios_autorizados', user.email.toLowerCase()));
            if (!authorization.exists() || authorization.data().status !== 'permitido') {
                await signOut(auth);
                throw new Error('Usuário sem autorização para o painel.');
            }

            localStorage.setItem('user_email', user.email);
            localStorage.setItem('user_nome', user.displayName || user.email);
            document.body.classList.remove('auth-pending');
        } catch (error) {
            console.error('Acesso ao dashboard recusado:', error);
            localStorage.removeItem('logado');
            localStorage.removeItem('user_email');
            localStorage.removeItem('user_nome');
            window.location.replace('index.html');
        }
    });
}
