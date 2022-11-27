import { Store } from 'pinia';
import { v4 as uuid } from 'uuid';
import { entries } from 'idb-keyval';
import { fileDialog } from 'file-select-dialog';
import { has, head, sortBy, debounce, startsWith, cloneDeep } from 'lodash';
import useCurrentTab from './useCurrentTab';
import useTemplateStore from './useTemplateStore';
import useProjectStoreFactory from './useProjectStoreFactory';
import { computed, ref, useContext } from '@nuxtjs/composition-api';

export const namespace = 'pages/';

const getPagesFromLocalStorage = () => {
    return Object.keys(window.localStorage)
        .filter((key) => key.startsWith(namespace))
        .map((key) => [key, JSON.parse(window.localStorage.getItem(key))]);
};

const getPagesFromDatabase = async () => {
    return (await entries())
        .filter(([key]) => key.startsWith(namespace))
        .map(([key, value]) => [key, JSON.parse(value)]);
};

export default function () {
    const { $bus, $config } = useContext();

    const templates = useTemplateStore();

    const { currentTab, setTabFromProject } = useCurrentTab();

    const projects = ref([]);

    const canAddNewProject = computed(() => {
        return $config.isDesktop || projects.value.length < 200;
    });

    const canAddNewTemplate = computed(() => {
        return $config.isDesktop || templates.all().length < 300;
    });

    const currentProject = computed(() => {
        return findProjectByTabId(currentTab.value);
    });

    /**
     * Make a new project store.
     *
     * @param {String} id
     * @param {Object|null} initialValue
     *
     * @returns {Store}
     */
    const makeProjectStore = (id = null, initialValue = null) => {
        id = id ?? uuid();

        const name = startsWith(id, namespace) ? id : namespace + id;

        const make = useProjectStoreFactory(name, initialValue);

        const store = make();

        store.load();

        store.$subscribe(debounce(store.sync, 2000));

        return store;
    };

    /**
     * Add a new project.
     *
     * @param {string|null} id
     *
     * @returns {Store|null}
     */
    const addNewProject = (id = null) => {
       /* if (!canAddNewProject.value) {
            $bus.$emit('alert', 'danger', 'Download the desktop app to unlock more tabs.');

            return;
        }*/

        const newProject = makeProjectStore(id);

        projects.value.push(newProject);

        setTabFromProject(newProject);

        return newProject;
    };

    /**
     * Sync the project state with the given data.
     *
     * @param {Store} project
     * @param {*} data
     */
    const syncProjectStateWithData = (project, data) => {
        project.$patch((state) => {
            state.page = data.page;
            state.settings = data.settings;
            state.tab.name = data.tab.name;

            // Here we will port old editors that don't contain the newly added
            // properties from the new v1.9.0 update. v1.9.0 has also added a
            // new "version" property to projects, so we can target this
            // property to determine if we need to add these attributes.
            if (!data.hasOwnProperty('version')) {
                state.page.editors.map((editor) => {
                    editor.added = [];
                    editor.removed = [];
                    editor.focused = [];
                });
            }

            // Here we will port the old orientation setting,
            // so templates that were saved in an older
            // version can be restored properly.
            if (['portrait', 'landscape'].includes(state.page.orientation)) {
                state.page.orientation = 'left';
            }
        });
    };

    /**
     * Attempt to import a new project from a JSON file.
     */
    const importNewProject = async () => {
        const files = await fileDialog({ accept: '.json' });

        const file = head(files);

        if (!file) {
            return;
        }

        const data = await new Response(file).json();

        ['tab', 'page', 'settings'].forEach((requiredKey) => {
            if (!has(data, requiredKey)) {
                $bus.$emit(
                    'alert',
                    'danger',
                    'Error importing configuration. Required data is missing.'
                );

                console.error(`The configuration file is missing the data key [${requiredKey}].`);
            }
        });

        const project = addNewProject();

        if (project) {
            syncProjectStateWithData(project, data);
        }
    };

    /**
     * Add a new project from the given template.
     *
     * @param {*} template
     *
     * @returns {Store}
     */
    const addProjectFromTemplate = (template) => {
        const data = cloneDeep(template);

        const project = addNewProject();

        if (project) {
            syncProjectStateWithData(project, data);
        }
    };

    /**
     * Find a project by its tab ID.
     *
     * @param {String} tabId
     *
     * @returns {Store|null}
     */
    const findProjectByTabId = (tabId) => {
        return projects.value.find((project) => project.tab.id === tabId);
    };

    /**
     * Duplicate a project.
     *
     * @param {Store} project
     */
    const duplicateProject = (project) => {
        const data = cloneDeep(project);

        const newProject = addNewProject();

        if (newProject) {
            syncProjectStateWithData(newProject, data);
        }
    };

    /**
     * Delete a project.
     *
     * @param {Store} project
     * @param {Number} index
     */
    const deleteProject = (project, index) => {
        project.clear();
        project.$dispose();

        projects.value.splice(index, 1);

        // prettier-ignore
        projects.value.length === 0
            ? addNewProject()
            : setTabFromProject(head(projects.value));
    };

    /**
     * Hydrate the projects from local storage.
     */
    const hydrateFromStorage = async () => {
        // Here we will migrate pages from the previous version one
        // time, by iterating through and creating all the stored
        // pages, then deleting them from localStorage.
        const stored = getPagesFromLocalStorage().map(([key, value]) => {
            const store = makeProjectStore(key, value);

            window.localStorage.removeItem(key);

            return store;
        });

        stored.push(
            ...(await getPagesFromDatabase()).map(([key, value]) => makeProjectStore(key, value))
        );

        projects.value = sortBy(stored, ({ tab }) => tab.order ?? tab.created_at);
    };

    /**
     * Sync the project tab order when they have changed.
     */
    const syncTabOrder = debounce(() => {
        projects.value.map((project, index) => {
            project.$patch((state) => (state.tab.order = index));
        });
    }, 2500);

    return {
        projects,
        syncTabOrder,
        addNewProject,
        deleteProject,
        duplicateProject,
        currentProject,
        importNewProject,
        canAddNewProject,
        canAddNewTemplate,
        findProjectByTabId,
        hydrateFromStorage,
        addProjectFromTemplate,
    };
}
