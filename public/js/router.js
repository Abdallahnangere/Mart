export default class Router {
    constructor() {
        this.appContainer = document.getElementById('app');
        
        // Handle Back/Forward
        window.addEventListener('popstate', (e) => this.handleLocation());
        
        // Handle Clicks
        document.addEventListener('click', (e) => {
            const link = e.target.closest('[data-link]');
            if (link) {
                e.preventDefault();
                this.navigate(link.getAttribute('href'));
            }
        });

        // Handle Initial Load
        this.handleLocation();
    }

    async navigate(path) {
        window.history.pushState({}, '', path);
        await this.handleLocation();
    }

    async handleLocation() {
        const path = window.location.pathname;
        
        // Map URL paths to File paths
        // If path is '/', load '/home.html' (we need to create the home content specifically or handle it)
        // But based on your structure, index.html contained the home content directly.
        // To support routing properly, we should treat the "Home" content as a view or handle '/' specifically.
        
        let file = path;
        if (path === '/' || path === '/index.html') {
            // Special Case: Render Home Logic manually or fetch a home fragment
            this.renderHome();
            return;
        }

        // Add .html extension if missing for fetch
        if (!file.endsWith('.html')) {
            file += '.html';
        }

        await this.loadView(file);
    }

    renderHome() {
        // Re-inject the Home Page Content (The Grid of Doors)
        this.appContainer.innerHTML = `
            <div class="flex flex-col items-center text-center mt-8 mb-12 fade-in">
                <div class="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-6">
                    <img src="/logo.png" alt="Logo" class="w-10 h-10 object-contain" onerror="this.style.display='none'">
                    <i data-lucide="zap" class="w-8 h-8 text-blue-600" onerror="this.style.display='block'"></i>
                </div>
                <h1 class="text-3xl font-semibold tracking-tight text-neutral-900 mb-2">SAUKI MART</h1>
                <p class="text-sm text-neutral-500 max-w-xs leading-relaxed">
                    Premium MTN routers, SIMs, and affordable data plans. Delivered nationwide.
                </p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto fade-in" style="animation-delay: 0.1s;">
                <a href="/data" data-link class="door-card group relative bg-white rounded-3xl p-6 shadow-sm border border-white hover:shadow-md cursor-pointer flex items-center justify-between">
                    <div class="flex flex-col"><span class="text-lg font-medium text-neutral-900">Buy Data</span><span class="text-xs text-neutral-400 mt-1">Instant delivery</span></div>
                    <div class="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center group-hover:bg-blue-100"><i data-lucide="wifi" class="w-6 h-6 text-blue-600"></i></div>
                </a>
                <a href="/devices" data-link class="door-card group relative bg-white rounded-3xl p-6 shadow-sm border border-white hover:shadow-md cursor-pointer flex items-center justify-between">
                    <div class="flex flex-col"><span class="text-lg font-medium text-neutral-900">Shop Devices</span><span class="text-xs text-neutral-400 mt-1">Routers & SIMs</span></div>
                    <div class="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center group-hover:bg-orange-100"><i data-lucide="smartphone" class="w-6 h-6 text-orange-600"></i></div>
                </a>
                <a href="/agent" data-link class="door-card group relative bg-white rounded-3xl p-6 shadow-sm border border-white hover:shadow-md cursor-pointer flex items-center justify-between">
                    <div class="flex flex-col"><span class="text-lg font-medium text-neutral-900">Become Agent</span><span class="text-xs text-neutral-400 mt-1">Earn commissions</span></div>
                    <div class="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center group-hover:bg-green-100"><i data-lucide="users" class="w-6 h-6 text-green-600"></i></div>
                </a>
                <a href="/tracking" data-link class="door-card group relative bg-white rounded-3xl p-6 shadow-sm border border-white hover:shadow-md cursor-pointer flex items-center justify-between">
                    <div class="flex flex-col"><span class="text-lg font-medium text-neutral-900">Track Order</span><span class="text-xs text-neutral-400 mt-1">Check status</span></div>
                    <div class="w-12 h-12 rounded-full bg-purple-50 flex items-center justify-center group-hover:bg-purple-100"><i data-lucide="search" class="w-6 h-6 text-purple-600"></i></div>
                </a>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
    }

    async loadView(file) {
        try {
            // Animation Out
            this.appContainer.style.opacity = '0';
            this.appContainer.style.transform = 'translateY(5px)';
            
            const response = await fetch(file);
            if (!response.ok) throw new Error('Page not found');
            const html = await response.text();
            
            setTimeout(() => {
                this.appContainer.innerHTML = html;
                if (window.lucide) window.lucide.createIcons();
                
                // Animation In
                this.appContainer.style.opacity = '1';
                this.appContainer.style.transform = 'translateY(0)';
            }, 200);

        } catch (error) {
            console.error('Routing error:', error);
            this.appContainer.innerHTML = `<div class="p-10 text-center text-red-500">Failed to load content.</div>`;
            this.appContainer.style.opacity = '1';
        }
    }
}
