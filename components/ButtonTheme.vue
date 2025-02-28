<template>
    <div class="relative cursor-pointer">
        <div
            class="relative flex items-center justify-center w-64 h-48 overflow-hidden transition-all rounded-lg hover:shadow-lg hover:-translate-y-1"
        >
            <button
                v-bind="$attrs"
                v-on="$listeners"
                class="text-left rounded-lg focus:outline-none focus:ring-0"
            >
                <div class="absolute inset-0 w-full h-full" v-bind="background"></div>

                <LazyComponent
                    as="div"
                    :show="rendered"
                    :threshold="[0, 0.2]"
                    @intersected="visible = $event"
                    class="relative flex items-center justify-center w-64 h-48"
                >
                    <Window v-if="blocks" preview :blocks="blocks" :settings="themeSettings" />

                    <div
                        slot="placeholder"
                        v-bind="background"
                        class="relative w-64 h-48 overflow-hidden rounded-lg"
                    />
                </LazyComponent>
            </button>

            <div class="absolute top-0 inline-flex justify-center w-full">
                <span
                    class="px-4 py-1 text-xs font-bold tracking-wide text-center uppercase rounded-b-lg shadow text-ui-gray-300 bg-ui-gray-900"
                >
                    {{ theme }}
                </span>
            </div>
        </div>

        <div
            v-if="active"
            class="absolute inline-flex items-center justify-center w-5 h-5 bg-green-400 rounded-full shadow -top-2 -right-2"
        >
            <CheckIcon class="w-4 h-4 text-white" />
        </div>
    </div>
</template>

<script>
import { CheckIcon } from 'vue-feather-icons';
import useShiki from '@/composables/useShiki';
import { debounce, defaults, cloneDeep } from 'lodash';
import { ref, watch, reactive, toRefs, onMounted, useContext } from '@nuxtjs/composition-api';

export default {
    inheritAttrs: false,

    props: {
        code: {
            type: Array,
            required: true,
        },
        theme: {
            type: String,
            required: true,
        },
        active: {
            type: Boolean,
            required: true,
        },
        settings: {
            type: Object,
            required: true,
        },
        languages: {
            type: Array,
            required: true,
        },
        background: {
            type: Object,
            required: true,
        },
    },

    components: { CheckIcon },

    setup(props) {
        const { code, theme, settings, languages } = toRefs(props);

        const { $shiki } = useContext();

        const { buildCodeBlocks } = useShiki();

        const blocks = ref([]);
        const visible = ref(false);
        const rendered = ref(false);
        const themeSettings = reactive({});
        const previouslyRendered = ref(null);

        const generateTokens = () =>
            buildCodeBlocks(
                {
                    code: code.value,
                    theme: theme.value,
                    languages: languages.value,
                },
                ({ blocks: code, themeType: type, themeBackground: background }) => {
                    blocks.value = code;
                    themeSettings.themeType = type;
                    themeSettings.themeBackground = background;
                }
            ).then(() => (previouslyRendered.value = code.value));

        watch(
            settings,
            (values) =>
                Object.assign(
                    themeSettings,
                    defaults({ scale: 0.5, position: 'center' }, cloneDeep(values))
                ),
            { immediate: true, deep: true }
        );

        onMounted(() => {
            watch(visible, (visible) => {
                if (visible && code.value != previouslyRendered.value) {
                    $shiki
                        .loadTheme(theme.value)
                        .then(generateTokens)
                        .then(() => (rendered.value = true));
                }
            });

            watch(
                code,
                debounce(() => visible.value && generateTokens(), 750)
            );
        });

        return { blocks, visible, rendered, themeSettings };
    },
};
</script>
