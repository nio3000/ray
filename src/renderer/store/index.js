import { remote } from 'electron'
import Vue from 'vue'
import Vuex from 'vuex'
import createLogger from 'vuex/dist/logger'

import fs from 'fs'
import path from 'path'
import uri2path from 'file-uri-to-path'

import * as types from './mutation-types'
import * as htmlTemplates from '../templates/html-templates'
import * as cssTemplates from '../templates/css-templates'
import { defaultValues, renderHtml } from '../utils'

Vue.use(Vuex)

const appConfig = remote.getGlobal('config')
const maxRecentFiles = 5
let newFileId = 1

const state = {
  bus: {
    project: null, // possible actions: create, rename, delete, save-all;
    file: null, // possible actions: save-current, show-in-folder;
    notification: null
  },
  newFileName: 'File-1',
  configLoading: false,

  currentFile: {},
  activeFiles: [],
  recentFiles: [],
  currentProject: {},
  projects: [],
  settings: {
    editor: {
      baseFontSize: defaultValues.baseFontSize,
      fontColor: defaultValues.fontColor,
      backgroundColor: defaultValues.backgroundColor
    }
  },
  view: {
    sidebar: {
      visible: false,
      width: 0
    },
    dialogProjects: {
      visible: false
    },
    dialogSettings: {
      visible: false
    },
    dialogHelp: {
      visible: false
    }
  }
}

const getters = {
  allowShortcuts: state => {
    const view = state.view
    return !(view.dialogProjects.visible || view.dialogSettings.visible || view.dialogHelp.visible)
  },
  editorStyle: state => {
    const s = state.settings.editor
    let style = `font-size:${parseInt(s.baseFontSize)}px;`
    style += `color:${s.fontColor};`
    style += `background-color:${s.backgroundColor};`
    return style
  },
  getProjectByName: state => name => {
    return state.projects.find(project => project.name === name)
  },
  getActiveFileById: state => id => {
    return state.activeFiles.find(file => file.id === id)
  },
  getActiveFileByPath: state => path => {
    return state.activeFiles.find(file => file.path === path)
  }
}

const mutations = {
  [types.BUS_ADD_MESSAGE] (state, { section, message }) {
    state.bus[section] = message
  },

  [types.PROJECT_ADD] (state, project) {
    state.projects.push(project)
  },

  [types.PROJECT_DELETE] (state, projectName) {
    const i = state.projects.findIndex(project => project.name === projectName)
    if (i !== -1) state.projects.splice(i, 1)
  },

  [types.PROJECT_SET_CURRENT] (state, projectName) {
    if (!projectName) {
      state.currentProject = {}
      return
    }
    const i = state.projects.findIndex(project => project.name === projectName)
    if (i !== -1) state.currentProject = state.projects[i]
  },

  [types.PROJECT_SET_NAME] (state, { projectName, newName }) {
    const i = state.projects.findIndex(project => project.name === projectName)
    if (i !== -1) state.projects[i].name = newName
  },

  [types.PROJECT_SET_DATA] (state, { projectName, data }) {
    const i = state.projects.findIndex(project => project.name === projectName)
    if (i !== -1) state.projects[i].data = data
  },

  [types.FILE_SET_NEW_NAME] (state) {
    const name = state.newFileName.slice(0, 5)
    const num = +state.newFileName.slice(5) + 1
    state.newFileName = name + num
  },

  [types.FILE_SET_CURRENT] (state, fileId) {
    const i = state.activeFiles.findIndex(file => file.id === fileId)
    if (i !== -1) state.currentFile = state.activeFiles[i]
  },

  [types.FILE_ADD_ACTIVE] (state, file) {
    state.activeFiles.push(file)
  },

  [types.FILE_DELETE_ACTIVE] (state, fileId) {
    const i = state.activeFiles.findIndex(file => file.id === fileId)
    if (i !== -1) state.activeFiles.splice(i, 1)
  },

  [types.FILE_ADD_RECENT] (state, { fileName, filePath }) {
    const i = state.recentFiles.findIndex(file => file.path === filePath)
    if (i === 0) return

    if (i > 0) state.recentFiles.splice(i, 1)
    if (!fileName) fileName = path.basename(filePath, path.extname(filePath))
    state.recentFiles.unshift({ name: fileName, path: filePath })

    if (state.recentFiles.length > maxRecentFiles) state.recentFiles.pop()
  },

  [types.FILE_DELETE_RECENT] (state, filePath) {
    const i = state.recentFiles.findIndex(file => file.path === filePath)
    if (i !== -1) state.recentFiles.splice(i, 1)
  },

  [types.FILE_SET_PATH] (state, { fileId, filePath }) {
    const i = state.activeFiles.findIndex(file => file.id === fileId)
    if (i !== -1) state.activeFiles[i].path = filePath
  },

  [types.FILE_SET_NAME] (state, { fileId, fileName }) {
    const i = state.activeFiles.findIndex(file => file.id === fileId)
    if (i !== -1) state.activeFiles[i].name = fileName
  },

  [types.FILE_SET_SEARCH_MODE] (state, { fileId, value }) {
    const i = state.activeFiles.findIndex(file => file.id === fileId)

    if (value === undefined) { // toggle
      state.activeFiles[i].searchMode = !state.activeFiles[i].searchMode
    } else {
      state.activeFiles[i].searchMode = value
    }
  },

  [types.FILE_SET_FLAGS] (state, { fileId, flags }) {
    const i = state.activeFiles.findIndex(file => file.id === fileId)
    Object.keys(flags).forEach(flag => {
      state.activeFiles[i].flags[flag] = flags[flag]
    })
  },

  [types.SETTINGS_SET] (state, settings) {
    Object.keys(settings).forEach(section => {
      Object.keys(state.settings[section]).forEach(key => {
        state.settings[section][key] = settings[section][key]
      })
    })
  },

  [types.VIEW_TOGGLE_SIDEBAR] (state, flag) {
    if (flag !== undefined) state.view.sidebar.visible = flag
    else state.view.sidebar.visible = !state.view.sidebar.visible
  },

  [types.VIEW_TOGGLE_DIALOG_PROJECTS] (state, flag) {
    if (flag !== undefined) state.view.dialogProjects.visible = flag
    else state.view.dialogProjects.visible = !state.view.dialogProjects.visible
  },

  [types.VIEW_TOGGLE_DIALOG_SETTINGS] (state, flag) {
    if (flag !== undefined) state.view.dialogSettings.visible = flag
    else state.view.dialogSettings.visible = !state.view.dialogSettings.visible
  },

  [types.VIEW_TOGGLE_DIALOG_HELP] (state, flag) {
    if (flag !== undefined) state.view.dialogHelp.visible = flag
    else state.view.dialogHelp.visible = !state.view.dialogHelp.visible
  },

  [types.VIEW_SET_SIDEBAR_WIDTH] (state, width) {
    state.view.sidebar.width = width
  }
}

const actions = {
  async loadAppConfig ({ dispatch, commit, state, getters }) {
    if (!appConfig) {
      commit('BUS_ADD_MESSAGE', { section: 'notification', message: { text: 'Configuration file is not available', type: 'error' } })
    }

    try {
      const configStore = appConfig.store

      // Settings
      if (configStore.settings) commit(types.SETTINGS_SET, configStore.settings)
      // View
      if (configStore.view) {
        if (configStore.view.sidebar) {
          if (configStore.view.sidebar.visible !== undefined) commit(types.VIEW_TOGGLE_SIDEBAR, configStore.view.sidebar.visible)
          if (configStore.view.sidebar.width) commit(types.VIEW_SET_SIDEBAR_WIDTH, configStore.view.sidebar.width)
        }
      }
      // Projects
      if (configStore.projects && configStore.projects.length) {
        configStore.projects.forEach(project => {
          commit(types.PROJECT_ADD, {
            name: project.name,
            data: project.data || null
          })
        })
      }
      if (configStore.currentProject) {
        commit(types.PROJECT_SET_CURRENT, configStore.currentProject)
      }
      // Files
      if (configStore.activeFiles && configStore.activeFiles.length) {
        configStore.activeFiles.forEach(async (filePath, i) => {
          await dispatch('openFile', {
            filePath,
            setCurrent: i === 0
          })
        })
      } else {
        await dispatch('createNewFile')
      }
      if (configStore.recentFiles) {
        configStore.recentFiles.forEach(filePath => {
          commit(types.FILE_ADD_RECENT, { filePath })
        })
      }
      if (configStore.currentFile) {
        const file = getters.getActiveFileByPath(configStore.currentFile)
        if (file) commit(types.FILE_SET_CURRENT, file.id)
      }
    } catch (err) {
      commit('BUS_ADD_MESSAGE', {
        section: 'notification', message: { text: 'Unable to load/create configuration file', type: 'error' }
      })
      await dispatch('createNewFile')
    }
    return true
  },

  async saveAppConfig ({ commit, state }) {
    if (!appConfig) return

    const activeFilesPaths = state.activeFiles.map(file => file.path).filter(path => path)
    const recentFilesPaths = state.recentFiles.map(file => file.path)
    try {
      appConfig.set('currentFile', state.currentFile.path ? state.currentFile.path : '')
      appConfig.set('activeFiles', activeFilesPaths)
      appConfig.set('recentFiles', recentFilesPaths)
      appConfig.set('currentProject', state.currentProject.name ? state.currentProject.name : '')
      appConfig.set('projects', state.projects)
      appConfig.set('view', {
        sidebar: {
          visible: state.view.sidebar.visible,
          width: state.view.sidebar.width
        },
        window: {
          width: window.outerWidth,
          height: window.outerHeight,
          x: window.screenX,
          y: window.screenY
        }
      })
    } catch (e) {
      commit('BUS_ADD_MESSAGE', {
        section: 'notification', message: { text: 'Unable to save app configuration', type: 'error' }
      })
    }
    return true
  },

  async createProject ({ commit }, { projectName, setCurrent }) {
    commit(types.PROJECT_ADD, {
      name: projectName,
      data: null
    })
    if (setCurrent) commit(types.PROJECT_SET_CURRENT, projectName)
    return true
  },

  async saveProjects ({ commit, state }) {
    if (!appConfig || !state.projects.length) return

    try {
      appConfig.set('currentProject', state.currentProject.name ? state.currentProject.name : '')
      appConfig.set('projects', state.projects)
    } catch (e) {
      commit('BUS_ADD_MESSAGE', {
        section: 'notification', message: { text: 'Unable to save app configuration', type: 'error' }
      })
    }
    return true
  },

  async deleteProject ({ commit, state }, { projectName }) {
    if (projectName === state.currentProject.name) commit(types.PROJECT_SET_CURRENT, null)
    commit(types.PROJECT_DELETE, projectName)
    return true
  },

  async createNewFile ({ commit, state }) {
    const fileId = String(newFileId++)
    commit(types.FILE_ADD_ACTIVE, {
      id: fileId,
      name: state.newFileName,
      path: '',
      searchMode: false,
      flags: {
        wasChanged: false
      },
      dataType: 'b'
    })
    commit(types.FILE_SET_NEW_NAME)
    commit(types.FILE_SET_CURRENT, fileId)
    return true
  },

  async openFile ({ commit, state }, { filePath, setCurrent }) {
    if (filePath.startsWith('file://')) filePath = uri2path(filePath)

    // Check if already open
    let file = this.state.activeFiles.find(file => file.path === filePath)
    if (file) {
      if (this.state.currentFile.id !== file.id) commit(types.FILE_SET_CURRENT, file.id)
      return true
    }

    // Open file
    try {
      let data = fs.readFileSync(filePath, 'utf8')
      const b1 = data.indexOf('<body')
      const b2 = data.lastIndexOf('</body>')

      let dataType = ''
      if (b1 !== -1 && b2 !== -1) {
        dataType = data.substr(b1 + 13, 5)
        dataType = dataType === 'ray-b' ? 'b' : ''
        data = data.substring(b1 + 20, b2)
      }

      const fileName = path.basename(filePath, path.extname(filePath))
      const fileId = String(newFileId++)
      commit(types.FILE_ADD_ACTIVE, {
        id: fileId,
        name: fileName,
        path: filePath,
        searchMode: false,
        flags: {
          wasChanged: false
        },
        data: dataType === 'b' ? data : null,
        dataType
      })
      if (setCurrent) commit(types.FILE_SET_CURRENT, fileId)
      commit(types.FILE_DELETE_RECENT, filePath)
    } catch (e) {
      commit('BUS_ADD_MESSAGE', {
        section: 'notification', message: { text: `Unable to open file "${filePath}"`, type: 'error' }
      })
    }
    return true
  },

  async saveFile ({ commit, state, getters }, { file, filePath, contents }) {
    if (!filePath.endsWith('.html') && !filePath.endsWith('.htm')) filePath += '.html'

    const newFileName = path.basename(filePath, path.extname(filePath))
    const outputHtml = renderHtml(htmlTemplates.base, {
      title: newFileName,
      styleBase: cssTemplates.base,
      styleMain: cssTemplates.main,
      styleExtra: `body{${getters.editorStyle}}`,
      contents
    })

    try {
      fs.writeFileSync(filePath, outputHtml)
      if (file.path !== filePath) { // file path or name was changed
        commit(types.FILE_SET_PATH, { fileId: file.id, filePath })
        if (file.name !== newFileName) {
          commit(types.FILE_SET_NAME, { fileId: file.id, fileName: newFileName })
        }
      }
      commit(types.FILE_SET_FLAGS, { fileId: file.id, flags: { wasChanged: false } })
    } catch (e) {
      commit('BUS_ADD_MESSAGE', {
        section: 'notification', message: { text: `Unable to save file "${filePath}"`, type: 'error' }
      })
    }
    return true
  },

  async closeFile ({ dispatch, commit, state, getters }, { fileId }) {
    const len = state.activeFiles.length
    const file = getters.getActiveFileById(fileId)
    if (len === 1) await dispatch('createNewFile')

    // Activate other file
    if (state.currentFile.id === fileId) {
      for (let i = 0; i < len; i += 1) {
        if (state.activeFiles[i].id !== fileId) continue
        if (i < len - 1) commit(types.FILE_SET_CURRENT, state.activeFiles[i + 1].id)
        else commit(types.FILE_SET_CURRENT, state.activeFiles[i - 1].id)
        break
      }
    }

    if (file.path) commit(types.FILE_ADD_RECENT, { fileName: file.name, filePath: file.path })
    commit(types.FILE_DELETE_ACTIVE, fileId)
    return true
  },

  async updateSettings ({ commit }, { settings }) {
    commit(types.SETTINGS_SET, settings)

    try {
      appConfig.set('settings', settings)
    } catch (e) {
      commit('BUS_ADD_MESSAGE', { section: 'notification', message: { text: 'Unable to save settings', type: 'error' } })
    }
    return true
  }
}

export default new Vuex.Store({
  state,
  getters,
  mutations,
  actions,
  plugins: process.env.NODE_ENV !== 'production' ? [createLogger()] : [],
  strict: process.env.NODE_ENV !== 'production'
})
