import useAspectRatios from './useAspectRatios';
import { DEFAULT_BACKGROUND } from './useBackgrounds';
import { cloneDeep, defaults as applyDefaults } from 'lodash';
import usePreferencesStore from '@/composables/usePreferencesStore';
import { reactive, watch, nextTick, toRefs } from '@nuxtjs/composition-api';

export default function (props, context) {
    const { refs } = context;

    const { defaults } = toRefs(props);

    const preferences = usePreferencesStore();

    const { calculateAspectRatio } = useAspectRatios();

    const settingsDefaults = {
        title: '',
        width: 400,
        height: 200,
        position: 'center',
        landscape: false,
        showHeader: true,
        showTitle: true,
        showMenu: true,
        showColorMenu: false,
        showLineNumbers: false,
        background: DEFAULT_BACKGROUND,

        themeType: 'light',
        themeOpacity: 1.0,
        themeName: preferences.previewThemeName,
        themeBackground: '#fff',
        aspectRatio: null,

        lockWindowSize: preferences.previewLockToWindow,
        lockWindowPaddingX: preferences.previewLockToWindowPaddingX,
        lockWindowPaddingY: preferences.previewLockToWindowPaddingY,

        fontSize: preferences.previewFontSize,
        fontFamily: preferences.previewFontFamily,
        lineHeight: preferences.previewLineHeight,

        padding: 16,
        paddingLocked: true,
        paddingTop: 16,
        paddingBottom: 16,
        paddingLeft: 16,
        paddingRight: 16,

        marginTop: 0,
        marginBottom: 0,
        marginLeft: 0,
        marginRight: 0,

        image: null,
        scale: 1.0,

        showBorder: false,

        borderRadius: 12,
        borderRadiusLocked: true,
        borderRadiusTopLeft: 12,
        borderRadiusTopRight: 12,
        borderRadiusBottomLeft: 12,
        borderRadiusBottomRight: 12,
        borderWidth: 2,
        borderColor: {
            red: 0,
            green: 0,
            blue: 0,
            alpha: 1,
        },

        showShadow: true,
        shadowX: 0,
        shadowY: 10,
        shadowBlur: 10,
        shadowSpread: -5,
        shadowColor: {
            red: 0,
            green: 0,
            blue: 0,
            alpha: 0.3,
        },
    };

    const settings = reactive(applyDefaults(cloneDeep(defaults.value), settingsDefaults));

    const updateDimensions = () => {
        nextTick(() => {
            setWidth(refs.pane.actualWidth() * settings.scale);
            setHeight(refs.pane.actualHeight() * settings.scale);
        });
    };

    const setWidth = (width, manual = false) => {
        if (width >= 0) {
            settings.width = Math.round(width);
        }

        if (manual) {
            settings.aspectRatio = null;
        }
    };

    const setHeight = (height) => {
        if (height >= 0) {
            settings.height = Math.round(height);
        }
    };

    const resetWindowSize = () => {
        settings.aspectRatio = null;

        settings.width = 0;
        settings.height = 0;

        updateDimensions();
    };

    const setAspectRatio = (x, y) => {
        settings.aspectRatio = [x, y];

        applyAspectRatio();
    };

    const applyAspectRatio = () => {
        const [x, y] = settings.aspectRatio;

        setWidth(calculateAspectRatio([x, y], settings.height));
    };

    const setDefaultBackground = () => (settings.background = DEFAULT_BACKGROUND);

    watch(
        () => settings.showHeader,
        (enabled) => {
            settings.showTitle = enabled;
            settings.showMenu = enabled;
            settings.showColorMenu = enabled;
        }
    );

    watch(
        () => settings.padding,
        (value) => {
            settings.paddingTop = value;
            settings.paddingBottom = value;
            settings.paddingLeft = value;
            settings.paddingRight = value;
        }
    );

    watch(
        () => settings.paddingLocked,
        () => {
            settings.paddingTop = settings.padding;
            settings.paddingBottom = settings.padding;
            settings.paddingLeft = settings.padding;
            settings.paddingRight = settings.padding;
        }
    );

    return {
        settings,
        settingsDefaults,
        setWidth,
        setHeight,
        resetWindowSize,
        setAspectRatio,
        applyAspectRatio,
        updateDimensions,
        setDefaultBackground,
    };
}
