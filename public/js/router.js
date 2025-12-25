export default class Router {
    constructor() {
        this.routes = {};
        this.appContainer = document.getElementById('app');
        
        // Bind navigation events
        window.addEventListener('popstate', (e) => this.handlePopState(e));
        
        document.addEventListener('click', (e) => {
            const link = e.target.closest('[data-link]');
            if (link) {
                e.preventDefault();
                this.navigate(link.getAttribute('href'));
            }
        });
    }

    async navigate(path) {
        // Push state
        window.history.pushState({}, '', path);
        await this.loadView(path);
    }

    async handlePopState(e) {
        await this.loadView(window.location.pathname);
    }

    async loadView(path) {
        try {
            // Animation Out
            this.appContainer.style.opacity = '0';
            this.appContainer.style.transform = 'translateY(5px)';
            
            // Normalize path to file
            const file = path === '/' ? '/index.html' : path;
            
            // Fetch content
            const response = await fetch(file);
            if (!response.ok) throw new Error('Page not found');
            
            const html = await response.text();
            
            // Parse HTML to extract #app content only
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const newContent = doc.getElementById('app').innerHTML;

            // Wait for transition
            setTimeout(() => {
                this.appContainer.innerHTML = newContent;
                
                // Re-initialize icons and listeners
                if (window.lucide) window.lucide.createIcons();
                
                // Dispatch event for page-specific JS to hook into
                window.dispatchEvent(new CustomEvent('routeChanged', { detail: { path } }));

                // Animation In
                this.appContainer.style.opacity = '1';
                this.appContainer.style.transform = 'translateY(0)';
            }, 200);

        } catch (error) {
            console.error('Routing error:', error);
            this.appContainer.innerHTML = `<div class="p-10 text-center text-red-500">Failed to load content. <br> <a href="/" data-link class="underline mt-4 block">Go Home</a></div>`;
            this.appContainer.style.opacity = '1';
        }
    }
}
