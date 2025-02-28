<template>
    <div ref="root" :style="{ height: `${height}px` }"></div>
</template>

<script>
import {
    ref,
    watch,
    unref,
    toRefs,
    computed,
    onMounted,
    useContext,
    onBeforeUnmount,
} from '@nuxtjs/composition-api';
import { storeToRefs } from 'pinia';
import * as monaco from 'monaco-editor';
import useFonts from '@/composables/useFonts';
import { useResizeObserver } from '@vueuse/core';
import themes from 'monaco-themes/themes/themelist.json';
import { uniq, get, range, union, difference } from 'lodash';
import useApplicationStore from '@/composables/useApplicationStore';
import usePreferencesStore from '@/composables/usePreferencesStore';

export default {
    props: {
        value: {
            type: String,
            default: '',
        },
        added: {
            type: Array,
            default: () => [],
        },
        removed: {
            type: Array,
            default: () => [],
        },
        focused: {
            type: Array,
            default: () => [],
        },
        width: {
            type: Number,
            default: 0,
        },
        height: {
            type: Number,
            default: 0,
        },
        language: {
            type: String,
            default: 'php',
        },
        heightOffset: {
            type: Number,
            default: 0,
        },
        tabSize: {
            type: [String, Number],
            default: 4,
        },
    },

    setup(props, { emit }) {
        const { language, tabSize, value, width, height, added, removed, focused } = toRefs(props);

        const { $bus } = useContext();

        const root = ref(null);
        const editor = ref(null);

        const { fontFamilies } = useFonts();

        const addedLineDecos = ref({});
        const removedLineDecos = ref([]);
        const focusedLineDecos = ref([]);

        const { isDarkMode } = storeToRefs(useApplicationStore());

        const {
            editorDarkTheme,
            editorLightTheme,
            editorFontFamily,
            editorFontLigatures,
            editorFontSize: fontSize,
        } = storeToRefs(usePreferencesStore());

        const updateLayout = () => {
            if (root.value && root.value.offsetParent) {
                editor.value.layout({
                    width: root.value.clientWidth,
                    height: height.value || root.value.clientHeight,
                });
            }
        };

        const makeDecoration = (range, type) => {
            return {
                options: {
                    stickiness: 1,
                    marginClassName: `line ${type}`,
                },
                range: range,
            };
        };

        const selectionToRange = (selection) => {
            return range(selection.startLineNumber, selection.endLineNumber + 1);
        };

        useResizeObserver(document.body, updateLayout);

        Object.keys(themes).forEach((theme) => {
            const filename = themes[theme];

            monaco.editor.defineTheme(theme, require(`monaco-themes/themes/${filename}.json`));
        });

        const makeHighlightCallback = (className, ref) => () => {
            let selected = selectionToRange(editor.value.getSelection());

            const alreadySelected = unref(ref).filter((line) => selected.includes(line));

            // If the entire selected range is already selected, we will
            // take all of the selections and filter out the already
            // selected lines, effectively "toggling" them off.
            if (difference(selected, alreadySelected).length === 0) {
                selected = unref(ref).filter((line) => !alreadySelected.includes(line));
            } else {
                selected = union(unref(ref), selected);
            }

            emit(`update:${className}`, selected);
        };

        const makeDecosCallback = (className, ref) => (lines) => {
            ref.value = editor.value.deltaDecorations(
                ref.value,
                lines.map((line) =>
                    makeDecoration(
                        {
                            startColumn: 0,
                            endColumn: 0,
                            startLineNumber: line,
                            endLineNumber: line,
                        },
                        className
                    )
                )
            );
        };

        const fontFamily = computed(() => {
            const font = fontFamilies.value.find((font) => font.name === editorFontFamily.value);

            return get(font, 'attributes.style.fontFamily');
        });

        onMounted(async () => {
            editor.value = monaco.editor.create(root.value, {
                value: value.value,
                tabSize: tabSize.value,
                fontSize: fontSize.value,
                fontFamily: fontFamily.value,
                fontLigatures: editorFontLigatures.value,
                language: language.value,
                insertSpaces: true,
                padding: { top: 5 },
                minimap: { enabled: false },
                fixedOverflowWidgets: true,
                renderLineHighlight: false,
                scrollBeyondLastLine: false,
                lineNumbersMinChars: 6,
                theme: isDarkMode.value ? editorDarkTheme.value : editorLightTheme.value,
            });

            editor.value.addAction({
                id: 'add',
                label: 'Added Line',
                contextMenuGroupId: 'actions',
                keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyA],
                run: makeHighlightCallback('added', added),
            });

            editor.value.addAction({
                id: 'remove',
                label: 'Removed Line',
                contextMenuGroupId: 'actions',
                keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyR],
                run: makeHighlightCallback('removed', removed),
            });

            editor.value.addAction({
                id: 'focus',
                label: 'Focused Line',
                contextMenuGroupId: 'actions',
                keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF],
                run: makeHighlightCallback('focused', focused),
            });

            editor.value.onDidChangeModelContent((event) => {
                const currentValue = editor.value.getValue();

                if (currentValue !== value.value) {
                    emit('input', currentValue, event);
                }
            });

            $bus.$on('editors:refresh', updateLayout);

            watch(isDarkMode, (enabled) => {
                monaco.editor.setTheme(enabled ? editorDarkTheme.value : editorLightTheme.value);
            });

            watch(language, (language) => {
                monaco.editor.setModelLanguage(editor.value.getModel(), language);
            });

            watch(tabSize, (size) => editor.value.updateOptions({ tabSize: parseInt(size) }));

            watch(fontSize, (size) => editor.value.updateOptions({ fontSize: parseInt(size) }));

            watch(fontFamily, (family) => editor.value.updateOptions({ fontFamily: family }));

            watch(editorFontLigatures, (enabled) =>
                editor.value.updateOptions({ fontLigatures: enabled })
            );

            watch(value, () => {
                if (value.value !== editor.value.getValue()) {
                    editor.value.setValue(value.value);
                }
            });

            watch(value, () => {
                const decos = editor.value
                    .getModel()
                    .getAllDecorations()
                    .filter((deco) => deco.options.marginClassName?.includes('line'));

                ['added', 'removed', 'focused'].forEach((className) => {
                    const lines = decos
                        .filter((deco) => deco.options.marginClassName?.includes(className))
                        .map((deco) => deco.range.startLineNumber);

                    emit(`update:${className}`, uniq(lines));
                });
            });

            watch([width, height], updateLayout);

            watch(editorDarkTheme, (theme) => {
                if (isDarkMode.value) {
                    monaco.editor.setTheme(theme);
                }
            });

            watch(editorLightTheme, (theme) => {
                if (!isDarkMode.value) {
                    monaco.editor.setTheme(theme);
                }
            });

            watch(added, makeDecosCallback('added', addedLineDecos), { immediate: true });
            watch(removed, makeDecosCallback('removed', removedLineDecos), { immediate: true });
            watch(focused, makeDecosCallback('focused', focusedLineDecos), { immediate: true });
        });

        onBeforeUnmount(() => editor.value?.dispose());

        return { root, editor };
    },
};
</script>

<style>
.monaco-editor textarea {
    @apply focus:ring-0;
}

.monaco-editor .line.focused::before {
    @apply bg-blue-500 rounded w-1.5 h-1.5 whitespace-pre ml-1;
    content: ' ';
}

.monaco-editor .line.added::before {
    @apply bg-green-500 rounded w-1.5 h-1.5 whitespace-pre ml-3;
    content: ' ';
}

.monaco-editor .line.removed::before {
    @apply bg-red-500 rounded w-1.5 h-1.5 whitespace-pre ml-5;
    content: ' ';
}

.monaco-editor .line {
    @apply flex items-center justify-start;
}

.monaco-editor .parameter-hints-widget {
    border: 0;
}

.monaco-editor .parameter-hints-widget .signature {
    padding: 0;
}

.monaco-editor .suggest-widget {
    border: 0;
}

.monaco-editor.vs-dark .suggest-widget {
    border: 0;
}

.monaco-editor.rename-box,
.monaco-hover {
    top: 0;
}
</style>
