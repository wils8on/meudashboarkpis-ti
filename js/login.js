document.getElementById('loginForm').addEventListener('submit', function(event) {
    event.preventDefault(); // Evita que a página recarregue

    const userIn = document.getElementById('username').value;
    const passIn = document.getElementById('password').value;
    const errorMsg = document.getElementById('errorMessage');

    // Defina aqui um usuário e senha provisórios para teste
    const usuarioCorreto = "admin";
    const senhaCorreta = "1234";

    if (userIn === usuarioCorreto && passIn === senhaCorreta) {
        errorMsg.style.display = 'none';
        // Salva uma sessão simples no navegador para fingir que está logado
        localStorage.setItem('logado', 'true');
        // Redireciona para a página do Dashboard
        window.location.href = 'dashboard.html';
    } else {
        errorMsg.textContent = "Usuário ou senha inválidos!";
        errorMsg.style.display = 'block';
    }
});