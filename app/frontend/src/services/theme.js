// Theme Service - RAGMaker Desktop

import { 
    THEMES, 
    ACCENT_COLORS, 
    STORAGE_KEYS, 
    EVENTS, 
    DEFAULT_SETTINGS 
} from '../utils/constants.js';
import { storage, getPlatform } from '../utils/helpers.js';

class ThemeService {
    constructor() {
        this.currentTheme = DEFAULT_SETTINGS.theme;
        this.currentAccent = DEFAULT_SETTINGS.accentColor;
        this.systemTheme = this.getSystemTheme();
        this.platform = getPlatform();
        
        this.init();
    }
    
    /**
     * Initialize theme service
     */
    init() {
        // Load saved theme and accent
        this.currentTheme = storage.get(STORAGE_KEYS.THEME, DEFAULT_SETTINGS.theme);
        this.currentAccent = storage.get(STORAGE_KEYS.ACCENT_COLOR, DEFAULT_SETTINGS.accentColor);
        
        // Apply initial theme
        this.applyTheme(this.currentTheme);
        this.applyAccent(this.currentAccent);
        
        // Set platform-specific styles
        this.setPlatformStyles();
        
        // Listen for system theme changes
        this.setupSystemThemeListener();
        
        // Setup media query listeners for accessibility
        this.setupAccessibilityListeners();
    }
    
    /**
     * Get system theme preference
     */
    getSystemTheme() {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return THEMES.DARK;
        }
        return THEMES.LIGHT;
    }
    
    /**
     * Setup system theme change listener
     */
    setupSystemThemeListener() {
        if (window.matchMedia) {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            
            const handleSystemThemeChange = (e) => {
                this.systemTheme = e.matches ? THEMES.DARK : THEMES.LIGHT;
                
                // Auto-apply if using system theme
                if (this.currentTheme === THEMES.SYSTEM) {
                    this.applySystemTheme();
                }
            };
            
            // Modern browsers
            if (mediaQuery.addEventListener) {
                mediaQuery.addEventListener('change', handleSystemThemeChange);
            } else {
                // Legacy browsers
                mediaQuery.addListener(handleSystemThemeChange);
            }
        }
    }
    
    /**
     * Setup accessibility preference listeners
     */
    setupAccessibilityListeners() {
        // High contrast preference
        if (window.matchMedia) {
            const highContrastQuery = window.matchMedia('(prefers-contrast: high)');
            const handleContrastChange = (e) => {
                if (e.matches) {
                    this.applyTheme(THEMES.HIGH_CONTRAST);
                }
            };
            
            if (highContrastQuery.addEventListener) {
                highContrastQuery.addEventListener('change', handleContrastChange);
            } else {
                highContrastQuery.addListener(handleContrastChange);
            }
            
            // Reduced motion preference
            const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
            const handleMotionChange = (e) => {
                document.body.setAttribute('data-reduced-motion', e.matches);
            };
            
            if (reducedMotionQuery.addEventListener) {
                reducedMotionQuery.addEventListener('change', handleMotionChange);
            } else {
                reducedMotionQuery.addListener(handleMotionChange);
            }
            
            // Apply initial values
            handleContrastChange(highContrastQuery);
            handleMotionChange(reducedMotionQuery);
        }
    }
    
    /**
     * Set platform-specific styles
     */
    setPlatformStyles() {
        document.body.setAttribute('data-os', this.platform);
        
        // Platform-specific theme adjustments
        switch (this.platform) {
            case 'darwin':
                document.body.classList.add('platform-mac');
                break;
            case 'win32':
                document.body.classList.add('platform-windows');
                break;
            case 'linux':
                document.body.classList.add('platform-linux');
                break;
        }
    }
    
    /**
     * Apply theme
     */
    applyTheme(theme) {
        const body = document.body;
        
        // Remove existing theme classes
        Object.values(THEMES).forEach(t => {
            body.classList.remove(`theme-${t}`);
        });
        
        // Apply new theme
        if (theme === THEMES.SYSTEM) {
            body.classList.add(`theme-${THEMES.SYSTEM}`);
            this.applySystemTheme();
        } else {
            body.classList.add(`theme-${theme}`);
        }
        
        this.currentTheme = theme;
        storage.set(STORAGE_KEYS.THEME, theme);
        
        // Update window controls color for Electron
        if (window.electronAPI?.setWindowControlsColor) {
            const isDark = this.getEffectiveTheme() === THEMES.DARK;
            window.electronAPI.setWindowControlsColor(isDark);
        }
        
        // Dispatch theme change event
        window.dispatchEvent(new CustomEvent(EVENTS.THEME_CHANGED, {
            detail: { theme, effectiveTheme: this.getEffectiveTheme() }
        }));
    }
    
    /**
     * Apply system theme
     */
    applySystemTheme() {
        const body = document.body;
        const effectiveTheme = this.systemTheme;
        
        // Remove system theme variants
        body.classList.remove('system-light', 'system-dark');
        body.classList.add(`system-${effectiveTheme}`);
    }
    
    /**
     * Apply accent color
     */
    applyAccent(accent) {
        const body = document.body;
        
        // Remove existing accent classes
        Object.values(ACCENT_COLORS).forEach(a => {
            body.classList.remove(`accent-${a}`);
        });
        
        // Apply new accent
        body.classList.add(`accent-${accent}`);
        
        this.currentAccent = accent;
        storage.set(STORAGE_KEYS.ACCENT_COLOR, accent);
        
        // Dispatch accent change event
        window.dispatchEvent(new CustomEvent(EVENTS.ACCENT_CHANGED, {
            detail: { accent }
        }));
    }
    
    /**
     * Toggle between light and dark theme
     */
    toggleTheme() {
        const currentEffective = this.getEffectiveTheme();
        const newTheme = currentEffective === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK;
        this.setTheme(newTheme);
    }
    
    /**
     * Set theme
     */
    setTheme(theme) {
        if (!Object.values(THEMES).includes(theme)) {
            console.warn(`Invalid theme: ${theme}`);
            return;
        }
        
        this.applyTheme(theme);
    }
    
    /**
     * Set accent color
     */
    setAccent(accent) {
        if (!Object.values(ACCENT_COLORS).includes(accent)) {
            console.warn(`Invalid accent color: ${accent}`);
            return;
        }
        
        this.applyAccent(accent);
    }
    
    /**
     * Get current theme
     */
    getTheme() {
        return this.currentTheme;
    }
    
    /**
     * Get effective theme (resolves system theme)
     */
    getEffectiveTheme() {
        if (this.currentTheme === THEMES.SYSTEM) {
            return this.systemTheme;
        }
        return this.currentTheme;
    }
    
    /**
     * Get current accent color
     */
    getAccent() {
        return this.currentAccent;
    }
    
    /**
     * Get system theme
     */
    getSystemTheme() {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return THEMES.DARK;
        }
        return THEMES.LIGHT;
    }
    
    /**
     * Check if dark theme is active
     */
    isDark() {
        return this.getEffectiveTheme() === THEMES.DARK;
    }
    
    /**
     * Check if high contrast theme is active
     */
    isHighContrast() {
        return this.currentTheme === THEMES.HIGH_CONTRAST;
    }
    
    /**
     * Get available themes
     */
    getAvailableThemes() {
        return Object.values(THEMES).map(theme => ({
            id: theme,
            name: this.getThemeName(theme),
            current: theme === this.currentTheme
        }));
    }
    
    /**
     * Get available accent colors
     */
    getAvailableAccents() {
        return Object.values(ACCENT_COLORS).map(accent => ({
            id: accent,
            name: this.getAccentName(accent),
            current: accent === this.currentAccent
        }));
    }
    
    /**
     * Get human-readable theme name
     */
    getThemeName(theme) {
        const names = {
            [THEMES.LIGHT]: 'Light',
            [THEMES.DARK]: 'Dark',
            [THEMES.SYSTEM]: 'System',
            [THEMES.HIGH_CONTRAST]: 'High Contrast'
        };
        return names[theme] || theme;
    }
    
    /**
     * Get human-readable accent name
     */
    getAccentName(accent) {
        const names = {
            [ACCENT_COLORS.BLUE]: 'Blue',
            [ACCENT_COLORS.GREEN]: 'Green',
            [ACCENT_COLORS.PURPLE]: 'Purple',
            [ACCENT_COLORS.RED]: 'Red',
            [ACCENT_COLORS.ORANGE]: 'Orange',
            [ACCENT_COLORS.PINK]: 'Pink'
        };
        return names[accent] || accent;
    }
    
    /**
     * Export theme settings
     */
    exportSettings() {
        return {
            theme: this.currentTheme,
            accent: this.currentAccent,
            systemTheme: this.systemTheme,
            effectiveTheme: this.getEffectiveTheme()
        };
    }
    
    /**
     * Import theme settings
     */
    importSettings(settings) {
        if (settings.theme && Object.values(THEMES).includes(settings.theme)) {
            this.setTheme(settings.theme);
        }
        
        if (settings.accent && Object.values(ACCENT_COLORS).includes(settings.accent)) {
            this.setAccent(settings.accent);
        }
    }
    
    /**
     * Reset to default theme
     */
    reset() {
        this.setTheme(DEFAULT_SETTINGS.theme);
        this.setAccent(DEFAULT_SETTINGS.accentColor);
    }
    
    /**
     * Get CSS custom property value
     */
    getCSSProperty(property) {
        return getComputedStyle(document.documentElement).getPropertyValue(property).trim();
    }
    
    /**
     * Set CSS custom property
     */
    setCSSProperty(property, value) {
        document.documentElement.style.setProperty(property, value);
    }
    
    /**
     * Apply custom theme colors
     */
    applyCustomColors(colors = {}) {
        Object.entries(colors).forEach(([property, value]) => {
            if (property.startsWith('--')) {
                this.setCSSProperty(property, value);
            }
        });
    }
    
    /**
     * Get theme-appropriate icon
     */
    getThemedIcon(lightIcon, darkIcon) {
        return this.isDark() ? darkIcon : lightIcon;
    }
    
    /**
     * Wait for theme to be applied
     */
    waitForTheme(timeout = 1000) {
        return new Promise((resolve) => {
            const checkTheme = () => {
                if (document.body.classList.contains(`theme-${this.getEffectiveTheme()}`)) {
                    resolve();
                } else {
                    setTimeout(checkTheme, 10);
                }
            };
            
            checkTheme();
            
            // Timeout fallback
            setTimeout(resolve, timeout);
        });
    }
}

// Create singleton instance
const themeService = new ThemeService();

// Export singleton and class
export default themeService;
export { ThemeService };