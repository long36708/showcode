<template>
    <div
        class="flex flex-col justify-between flex-1 h-full overflow-hidden"
        :class="{
            'lg:flex-row': orientation === 'left',
            'lg:flex-row-reverse': orientation === 'right',
            'lg:flex-col': orientation === 'top',
            'lg:flex-col-reverse': orientation === 'bottom',
        }"
    >
        <div
            dusk="editors"
            ref="editorContainerRef"
            class="flex w-full h-full rounded-b-none"
            :class="{
                'flex-col': ['left', 'right'].includes(orientation),
                'divide-ui-gray-700 divide-x-4 flex-row': ['top', 'bottom'].includes(orientation),
            }"
        >
            <Editor
                dusk="editor"
                ref="editorRefs"
                class="w-full h-full overflow-hidden"
                v-for="(editor, index) in editors"
                v-model="editors[index].value"
                :id="editor.id"
                :key="index"
                :sizes="sizes"
                :orientation="orientation"
                :tab-size="editor.tabSize"
                :language="editor.language"
                :can-move-up="index !== 0"
                :can-move-down="index !== editors.length - 1"
                :can-remove="canRemoveEditor"
                :can-toggle-layout="index === 0"
                :added="editors[index].added"
                :removed="editors[index].removed"
                :focused="editors[index].focused"
                @add="addEditor"
                @remove="removeEditor"
                @up="moveEditorUp"
                @down="moveEditorDown"
                @update:layout="toggleLayout"
                @update:reverse="toggleReverse"
                @update:tab-size="editors[index].tabSize = $event"
                @update:language="editors[index].language = $event"
                @update:added="editors[index].added = $event"
                @update:removed="editors[index].removed = $event"
                @update:focused="editors[index].focused = $event"
            />
        </div>

        <Preview
            dusk="preview"
            ref="previewContainerRef"
            :code="code"
            :languages="languages"
            :name="project.tab.name"
            :defaults="project.settings"
            class="overflow-auto scrollbar-hide"
            @update:settings="$emit('update:settings', $event)"
        />
    </div>
</template>

<script>
import { v4 as uuid } from 'uuid';
import { XIcon } from 'vue-feather-icons';
import { last, range, defaults, debounce, cloneDeep } from 'lodash';
import useSplitView from '@/composables/useSplitView';
import {
    ref,
    toRefs,
    watch,
    nextTick,
    computed,
    reactive,
    useContext,
    onMounted,
} from '@nuxtjs/composition-api';
import { useWindowSize, useResizeObserver } from '@vueuse/core';
import usePreferencesStore from '@/composables/usePreferencesStore';

export default {
    props: {
        project: {
            type: Object,
            required: true,
        },
    },

    components: { XIcon },

    setup(props, { emit }) {
        const { $bus } = useContext();

        const preferences = usePreferencesStore();

        const editorRefs = ref([]);
        const editorContainerRef = ref(null);
        const previewContainerRef = ref(null);

        const { width } = useWindowSize();

        const hasSmallScreen = computed(() => width.value <= 1024);

        const data = reactive(
            defaults(cloneDeep(props.project.page), {
                editors: [],
                sizes: [40, 60],
                editorSizes: [],
                previousOrientation: null,
                orientation: hasSmallScreen.value ? 'top' : 'left',
            })
        );

        const { sizes, editorSizes, editors, orientation, previousOrientation } = toRefs(data);

        const canRemoveEditor = computed(() => editors.value.length > 1);

        useResizeObserver(document.body, () => {
            // Here we will force portrait mode when screen width is
            // small, then restore the users previously saved
            // orientation when screen width is increased.
            if (hasSmallScreen.value) {
                previousOrientation.value = previousOrientation.value ?? orientation.value;

                orientation.value = 'top';
            } else if (previousOrientation.value) {
                const previous = previousOrientation.value;

                previousOrientation.value = null;

                orientation.value = previous;
            }
        });

        const { init: initEditorSplitView } = useSplitView(
            editorRefs,
            computed(() => ({
                gutterSize: 5,
                sizes: editorSizes.value,
                onDrag: (values) => (editorSizes.value = values),
                direction: ['top', 'bottom'].includes(orientation.value)
                    ? 'horizontal'
                    : 'vertical',
            }))
        );

        const { init: initPageSplitView } = useSplitView(
            [editorContainerRef, previewContainerRef],
            computed(() => ({
                gutterSize: 5,
                sizes: sizes.value,
                onDrag: (values) => (sizes.value = values),
                direction: ['top', 'bottom'].includes(orientation.value)
                    ? 'vertical'
                    : 'horizontal',
            }))
        );

        const toggleLayout = () =>
            (orientation.value = {
                top: 'left',
                bottom: 'right',
                left: 'top',
                right: 'bottom',
            }[orientation.value]);

        const toggleReverse = () =>
            (orientation.value = {
                top: 'bottom',
                bottom: 'top',
                left: 'right',
                right: 'left',
            }[orientation.value]);

        const findEditorIndex = (id) => editors.value.findIndex((editor) => editor.id === id);

        const moveEditor = (from, to) => {
            const editor = editors.value[from];

            editors.value.splice(from, 1);

            editors.value.splice(to, 0, editor);
        };

        const moveEditorUp = (id) => {
            const index = findEditorIndex(id);

            moveEditor(index, index - 1);
        };

        const moveEditorDown = (id) => {
            const index = findEditorIndex(id);

            moveEditor(index, index + 1);
        };

        const removeEditor = (id) => {
            if (!canRemoveEditor.value) {
                return;
            }

            editors.value.splice(findEditorIndex(id), 1);

            $bus.$emit('editors:refresh');
        };

        const makeEditor = () => {
            const language = last(editors.value)?.language ?? preferences.editorLanguage;

            return {
                id: uuid(),
                added: [],
                removed: [],
                focused: [],
                language: language,
                tabSize: preferences.editorTabSize,
                value: preferences.editorInitialValue,
            };
        };

        const addEditor = () => {
            if (editors.value.length === 0) {
                orientation.value = hasSmallScreen.value ? 'top' : preferences.editorOrientation;
            }

            editors.value.push(makeEditor());

            $bus.$emit('editors:refresh');
        };

        const stripInitialPhpTag = (value) => value.replace('<?php', '').replace(/(\n*)/, '');

        const code = computed(() => {
            return editors.value.map(({ id, language, value, added, removed, focused }) => {
                const shouldStripInitialPhpTag = preferences.stripIntialPhpTag && language == 'php';

                let newValue = shouldStripInitialPhpTag ? stripInitialPhpTag(value) : value;

                let lineOffset = 0;

                if (shouldStripInitialPhpTag) {
                    const matches = value.replace('<?php', '').match(/(\n+)/);

                    if (matches) {
                        lineOffset = matches[0].split(/\n/g).length - 1;
                    }
                }

                // prettier-ignore
                return {
                    id,
                    value: newValue,
                    added: added?.map(line => line - lineOffset) || [],
                    removed: removed?.map(line => line - lineOffset) || [],
                    focused: focused?.map(line => line - lineOffset) || [],
                };
            });
        });

        const languages = computed(() =>
            editors.value.map(({ id, language }) => ({
                id,
                name: language,
            }))
        );

        watch(
            data,
            debounce((data) => emit('update:page', data), 5000),
            { deep: true }
        );

        watch(editorRefs, (refs) => {
            // Here we are calculating the availble size for each
            // editor after one has been added or removed, so
            // that the size may be distributed equally.
            editorSizes.value = range(0, 100, 100 / refs.length).map(() => 100 / refs.length);

            initEditorSplitView();
        });

        watch(orientation, () => {
            nextTick(initPageSplitView);
            nextTick(initEditorSplitView);
        });

        watch([orientation, editorSizes], () => $bus.$emit('editors:refresh'));

        // Here we are ensuring all editors that have been restored
        // from localstorage have any additional properties
        // that may have been added with future updates.
        editors.value = editors.value.map((editor) => defaults(editor, makeEditor()));

        onMounted(async () => {
            if (editors.value.length === 0) {
                addEditor();
            }

            initPageSplitView();
            initEditorSplitView();
        });

        return {
            code,
            sizes,
            editors,
            addEditor,
            languages,
            editorRefs,
            orientation,
            moveEditorUp,
            moveEditorDown,
            removeEditor,
            toggleLayout,
            toggleReverse,
            findEditorIndex,
            canRemoveEditor,
            editorContainerRef,
            previewContainerRef,
        };
    },
};
</script>
