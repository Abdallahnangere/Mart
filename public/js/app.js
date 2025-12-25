import Router from './router.js';

class App {
    constructor() {
        this.router = new Router();
        this.init();
    }

    init() {
        // Initial Icon Load
        if (window.lucide) {
            window.lucide.createIcons();
        }

        // Global styles injection for transitions
        const style = document.createElement('style');
        style.textContent = `
            #app {
                transition: opacity 0.2s ease, transform 0.2s ease;
            }
        `;
        document.head.appendChild(style);

        // Handle initial load if we are not on index
        // Since this is a static setup, the browser loads the file directly.
        // The router takes over subsequent clicks.
        console.log('Sauki Mart App Initialized');
    }
}

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
