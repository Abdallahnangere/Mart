export default class Router {
    constructor() {
        this.appContainer = document.getElementById('app');
        window.addEventListener('popstate', () => this.handleLocation());
        document.addEventListener('click', (e) => {
            const link = e.target.closest('[data-link]');
            if (link) {
                e.preventDefault();
                this.navigate(link.getAttribute('href'));
            }
        });
        this.handleLocation();
    }

    async navigate(path) {
        window.history.pushState({}, '', path);
        await this.handleLocation();
    }

    async handleLocation() {
        const path = window.location.pathname;
        let file = path === '/' ? '/index.html' : path;
        
        // Ensure .html extension
        if (!file.endsWith('.html') && file !== '/') file += '.html';
        
        // If Root, we manually construct the Home View to avoid fetch loop
        if (path === '/' || path === '/index.html') {
            this.renderHome();
            return;
        }

        await this.loadView(file);
    }

    renderHome() {
        // Re-inject the Home Page Content (Grid)
        this.appContainer.innerHTML = `
            <div class="flex flex-col items-center text-center mt-8 mb-12 fade-in">
                <div class="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-6">
                    <img src="/logo.png" alt="Logo" class="w-10 h-10 object-contain hidden" onload="this.classList.remove('hidden')">
                    <i data-lucide="zap" class="w-8 h-8 text-blue-600 block"></i>
                </div>
                <h1 class="text-3xl font-semibold tracking-tight text-neutral-900 mb-2">SAUKI MART</h1>
                <p class="text-sm text-neutral-500 max-w-xs leading-relaxed">
                    Premium MTN routers, SIMs, and affordable data plans. Delivered nationwide.
                </p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto fade-in">
                <a href="/data" data-link class="door-card bg-white rounded-3xl p-6 shadow-sm border border-white hover:shadow-md flex justify-between">
                    <div><span class="text-lg font-medium">Buy Data</span><br><span class="text-xs text-neutral-400">Instant delivery</span></div>
                    <div class="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center"><i data-lucide="wifi" class="text-blue-600 w-6 h-6"></i></div>
                </a>
                <a href="/devices" data-link class="door-card bg-white rounded-3xl p-6 shadow-sm border border-white hover:shadow-md flex justify-between">
                    <div><span class="text-lg font-medium">Shop Devices</span><br><span class="text-xs text-neutral-400">Routers & SIMs</span></div>
                    <div class="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center"><i data-lucide="smartphone" class="text-orange-600 w-6 h-6"></i></div>
                </a>
                <a href="/agent" data-link class="door-card bg-white rounded-3xl p-6 shadow-sm border border-white hover:shadow-md flex justify-between">
                    <div><span class="text-lg font-medium">Become Agent</span><br><span class="text-xs text-neutral-400">Earn commissions</span></div>
                    <div class="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center"><i data-lucide="users" class="text-green-600 w-6 h-6"></i></div>
                </a>
                <a href="/tracking" data-link class="door-card bg-white rounded-3xl p-6 shadow-sm border border-white hover:shadow-md flex justify-between">
                    <div><span class="text-lg font-medium">Track Order</span><br><span class="text-xs text-neutral-400">Check status</span></div>
                    <div class="w-12 h-12 rounded-full bg-purple-50 flex items-center justify-center"><i data-lucide="search" class="text-purple-600 w-6 h-6"></i></div>
                </a>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
    }

    async loadView(file) {
        try {
            const response = await fetch(file);
            if (!response.ok) throw new Error('Page not found');
            const html = await response.text();
            
            // 1. Inject HTML
            this.appContainer.innerHTML = html;
            if (window.lucide) window.lucide.createIcons();

            // 2. FORCE SCRIPT EXECUTION
            // Find the script tag in the fetched HTML, create a new one, and append it
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const oldScript = doc.querySelector('script[src]');
            
            if (oldScript) {
                const newScript = document.createElement('script');
                newScript.src = oldScript.src + '?t=' + new Date().getTime(); // Cache busting
                newScript.type = 'module';
                document.body.appendChild(newScript);
            }

        } catch (error) {
            console.error('Routing error:', error);
            this.appContainer.innerHTML = `<div class="p-10 text-center text-red-500">Failed to load content.</div>`;
        }
    }
}
