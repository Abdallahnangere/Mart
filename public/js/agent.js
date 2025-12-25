function init() {
    if (localStorage.getItem('agent_token')) {
        showDashboard();
    }
    setupTabs();
    setupActions();
    if (window.lucide) window.lucide.createIcons();
}

function setupTabs() {
    const loginTab = document.getElementById('tab-login');
    const regTab = document.getElementById('tab-register');
    const loginView = document.getElementById('view-login');
    const regView = document.getElementById('view-register');

    loginTab.onclick = () => {
        loginTab.classList.add('bg-white', 'shadow-sm', 'text-neutral-900');
        loginTab.classList.remove('text-neutral-500');
        regTab.classList.remove('bg-white', 'shadow-sm', 'text-neutral-900');
        regTab.classList.add('text-neutral-500');
        loginView.classList.remove('hidden');
        regView.classList.add('hidden');
    };

    regTab.onclick = () => {
        regTab.classList.add('bg-white', 'shadow-sm', 'text-neutral-900');
        regTab.classList.remove('text-neutral-500');
        loginTab.classList.remove('bg-white', 'shadow-sm', 'text-neutral-900');
        loginTab.classList.add('text-neutral-500');
        regView.classList.remove('hidden');
        loginView.classList.add('hidden');
    };
}

function setupActions() {
    // Register
    document.getElementById('btn-register').onclick = async () => {
        const name = document.getElementById('reg-name').value;
        const phone = document.getElementById('reg-phone').value;
        const email = document.getElementById('reg-email').value;
        const pin = document.getElementById('reg-pin').value;

        if (!name || !phone || !email || !pin) {
            alert('Please fill all fields');
            return;
        }

        // Mock API Call (Since register-agent.js endpoint wasn't in "ONLY Generate" list)
        // In real implementation: fetch('/api/register-agent', ...)
        
        alert(`Application Submitted for ${name}. Pending approval.`);
        document.getElementById('tab-login').click();
    };

    // Login
    document.getElementById('btn-login').onclick = () => {
        const email = document.getElementById('login-email').value;
        const pin = document.getElementById('login-pin').value;

        if (email && pin.length >= 4) {
            // Mock Auth Success
            localStorage.setItem('agent_token', 'mock_token_123');
            showDashboard();
        } else {
            alert('Invalid credentials');
        }
    };
}

function showDashboard() {
    document.getElementById('view-login').classList.add('hidden');
    document.getElementById('view-register').classList.add('hidden');
    document.querySelector('.flex.bg-neutral-100').classList.add('hidden'); // Hide tabs
    
    const dash = document.getElementById('view-dashboard');
    dash.classList.remove('hidden');
    
    // Simulate Fetching Balance
    setTimeout(() => {
        document.getElementById('dash-balance').innerText = '₦12,450.00';
        document.getElementById('stat-sales').innerText = '14';
        document.getElementById('stat-commission').innerText = '₦450';
    }, 500);
}

init();
