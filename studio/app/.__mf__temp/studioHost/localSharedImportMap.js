
// Windows temporarily needs this file, https://github.com/module-federation/vite/issues/68

    import {loadShare} from "@module-federation/runtime";
    const importMap = {
      
        "@ant-design/icons": async () => {
          let pkg = await import("__mf__virtual/studioHost__prebuild___mf_0_ant_mf_2_design_mf_1_icons__prebuild__.js");
            return pkg;
        }
      ,
        "@kb-labs/studio-event-bus": async () => {
          let pkg = await import("__mf__virtual/studioHost__prebuild___mf_0_kb_mf_2_labs_mf_1_studio_mf_2_event_mf_2_bus__prebuild__.js");
            return pkg;
        }
      ,
        "@kb-labs/studio-hooks": async () => {
          let pkg = await import("__mf__virtual/studioHost__prebuild___mf_0_kb_mf_2_labs_mf_1_studio_mf_2_hooks__prebuild__.js");
            return pkg;
        }
      ,
        "@kb-labs/studio-ui-core": async () => {
          let pkg = await import("__mf__virtual/studioHost__prebuild___mf_0_kb_mf_2_labs_mf_1_studio_mf_2_ui_mf_2_core__prebuild__.js");
            return pkg;
        }
      ,
        "@kb-labs/studio-ui-kit": async () => {
          let pkg = await import("__mf__virtual/studioHost__prebuild___mf_0_kb_mf_2_labs_mf_1_studio_mf_2_ui_mf_2_kit__prebuild__.js");
            return pkg;
        }
      ,
        "@tanstack/react-query": async () => {
          let pkg = await import("__mf__virtual/studioHost__prebuild___mf_0_tanstack_mf_1_react_mf_2_query__prebuild__.js");
            return pkg;
        }
      ,
        "antd": async () => {
          let pkg = await import("__mf__virtual/studioHost__prebuild__antd__prebuild__.js");
            return pkg;
        }
      ,
        "react": async () => {
          let pkg = await import("__mf__virtual/studioHost__prebuild__react__prebuild__.js");
            return pkg;
        }
      ,
        "react-dom": async () => {
          let pkg = await import("__mf__virtual/studioHost__prebuild__react_mf_2_dom__prebuild__.js");
            return pkg;
        }
      ,
        "react-router-dom": async () => {
          let pkg = await import("__mf__virtual/studioHost__prebuild__react_mf_2_router_mf_2_dom__prebuild__.js");
            return pkg;
        }
      ,
        "zustand": async () => {
          let pkg = await import("__mf__virtual/studioHost__prebuild__zustand__prebuild__.js");
            return pkg;
        }
      
    }
      const usedShared = {
      
          "@ant-design/icons": {
            name: "@ant-design/icons",
            version: "5.4.0",
            scope: ["default"],
            loaded: false,
            from: "studioHost",
            async get () {
              if (false) {
                throw new Error(`[Module Federation] Shared module '${"@ant-design/icons"}' must be provided by host`);
              }
              usedShared["@ant-design/icons"].loaded = true
              const {"@ant-design/icons": pkgDynamicImport} = importMap
              const res = await pkgDynamicImport()
              const exportModule = false && "@ant-design/icons" === "react"
                ? (res?.default ?? res)
                : {...res}
              // All npm packages pre-built by vite will be converted to esm
              Object.defineProperty(exportModule, "__esModule", {
                value: true,
                enumerable: false
              })
              return function () {
                return exportModule
              }
            },
            shareConfig: {
              singleton: true,
              requiredVersion: "^5.4.0",
              
            }
          }
        ,
          "@kb-labs/studio-event-bus": {
            name: "@kb-labs/studio-event-bus",
            version: "0.1.0",
            scope: ["default"],
            loaded: false,
            from: "studioHost",
            async get () {
              if (false) {
                throw new Error(`[Module Federation] Shared module '${"@kb-labs/studio-event-bus"}' must be provided by host`);
              }
              usedShared["@kb-labs/studio-event-bus"].loaded = true
              const {"@kb-labs/studio-event-bus": pkgDynamicImport} = importMap
              const res = await pkgDynamicImport()
              const exportModule = false && "@kb-labs/studio-event-bus" === "react"
                ? (res?.default ?? res)
                : {...res}
              // All npm packages pre-built by vite will be converted to esm
              Object.defineProperty(exportModule, "__esModule", {
                value: true,
                enumerable: false
              })
              return function () {
                return exportModule
              }
            },
            shareConfig: {
              singleton: true,
              requiredVersion: "^0.1.0",
              
            }
          }
        ,
          "@kb-labs/studio-hooks": {
            name: "@kb-labs/studio-hooks",
            version: "0.1.0",
            scope: ["default"],
            loaded: false,
            from: "studioHost",
            async get () {
              if (false) {
                throw new Error(`[Module Federation] Shared module '${"@kb-labs/studio-hooks"}' must be provided by host`);
              }
              usedShared["@kb-labs/studio-hooks"].loaded = true
              const {"@kb-labs/studio-hooks": pkgDynamicImport} = importMap
              const res = await pkgDynamicImport()
              const exportModule = false && "@kb-labs/studio-hooks" === "react"
                ? (res?.default ?? res)
                : {...res}
              // All npm packages pre-built by vite will be converted to esm
              Object.defineProperty(exportModule, "__esModule", {
                value: true,
                enumerable: false
              })
              return function () {
                return exportModule
              }
            },
            shareConfig: {
              singleton: true,
              requiredVersion: "^0.1.0",
              
            }
          }
        ,
          "@kb-labs/studio-ui-core": {
            name: "@kb-labs/studio-ui-core",
            version: "0.1.0",
            scope: ["default"],
            loaded: false,
            from: "studioHost",
            async get () {
              if (false) {
                throw new Error(`[Module Federation] Shared module '${"@kb-labs/studio-ui-core"}' must be provided by host`);
              }
              usedShared["@kb-labs/studio-ui-core"].loaded = true
              const {"@kb-labs/studio-ui-core": pkgDynamicImport} = importMap
              const res = await pkgDynamicImport()
              const exportModule = false && "@kb-labs/studio-ui-core" === "react"
                ? (res?.default ?? res)
                : {...res}
              // All npm packages pre-built by vite will be converted to esm
              Object.defineProperty(exportModule, "__esModule", {
                value: true,
                enumerable: false
              })
              return function () {
                return exportModule
              }
            },
            shareConfig: {
              singleton: true,
              requiredVersion: "^0.1.0",
              
            }
          }
        ,
          "@kb-labs/studio-ui-kit": {
            name: "@kb-labs/studio-ui-kit",
            version: "0.1.0",
            scope: ["default"],
            loaded: false,
            from: "studioHost",
            async get () {
              if (false) {
                throw new Error(`[Module Federation] Shared module '${"@kb-labs/studio-ui-kit"}' must be provided by host`);
              }
              usedShared["@kb-labs/studio-ui-kit"].loaded = true
              const {"@kb-labs/studio-ui-kit": pkgDynamicImport} = importMap
              const res = await pkgDynamicImport()
              const exportModule = false && "@kb-labs/studio-ui-kit" === "react"
                ? (res?.default ?? res)
                : {...res}
              // All npm packages pre-built by vite will be converted to esm
              Object.defineProperty(exportModule, "__esModule", {
                value: true,
                enumerable: false
              })
              return function () {
                return exportModule
              }
            },
            shareConfig: {
              singleton: true,
              requiredVersion: "^0.1.0",
              
            }
          }
        ,
          "@tanstack/react-query": {
            name: "@tanstack/react-query",
            version: "5.0.0",
            scope: ["default"],
            loaded: false,
            from: "studioHost",
            async get () {
              if (false) {
                throw new Error(`[Module Federation] Shared module '${"@tanstack/react-query"}' must be provided by host`);
              }
              usedShared["@tanstack/react-query"].loaded = true
              const {"@tanstack/react-query": pkgDynamicImport} = importMap
              const res = await pkgDynamicImport()
              const exportModule = false && "@tanstack/react-query" === "react"
                ? (res?.default ?? res)
                : {...res}
              // All npm packages pre-built by vite will be converted to esm
              Object.defineProperty(exportModule, "__esModule", {
                value: true,
                enumerable: false
              })
              return function () {
                return exportModule
              }
            },
            shareConfig: {
              singleton: true,
              requiredVersion: "^5.0.0",
              
            }
          }
        ,
          "antd": {
            name: "antd",
            version: "5.21.0",
            scope: ["default"],
            loaded: false,
            from: "studioHost",
            async get () {
              if (false) {
                throw new Error(`[Module Federation] Shared module '${"antd"}' must be provided by host`);
              }
              usedShared["antd"].loaded = true
              const {"antd": pkgDynamicImport} = importMap
              const res = await pkgDynamicImport()
              const exportModule = false && "antd" === "react"
                ? (res?.default ?? res)
                : {...res}
              // All npm packages pre-built by vite will be converted to esm
              Object.defineProperty(exportModule, "__esModule", {
                value: true,
                enumerable: false
              })
              return function () {
                return exportModule
              }
            },
            shareConfig: {
              singleton: true,
              requiredVersion: "^5.21.0",
              
            }
          }
        ,
          "react": {
            name: "react",
            version: "18.3.0",
            scope: ["default"],
            loaded: false,
            from: "studioHost",
            async get () {
              if (false) {
                throw new Error(`[Module Federation] Shared module '${"react"}' must be provided by host`);
              }
              usedShared["react"].loaded = true
              const {"react": pkgDynamicImport} = importMap
              const res = await pkgDynamicImport()
              const exportModule = false && "react" === "react"
                ? (res?.default ?? res)
                : {...res}
              // All npm packages pre-built by vite will be converted to esm
              Object.defineProperty(exportModule, "__esModule", {
                value: true,
                enumerable: false
              })
              return function () {
                return exportModule
              }
            },
            shareConfig: {
              singleton: true,
              requiredVersion: "^18.3.0",
              
            }
          }
        ,
          "react-dom": {
            name: "react-dom",
            version: "18.3.0",
            scope: ["default"],
            loaded: false,
            from: "studioHost",
            async get () {
              if (false) {
                throw new Error(`[Module Federation] Shared module '${"react-dom"}' must be provided by host`);
              }
              usedShared["react-dom"].loaded = true
              const {"react-dom": pkgDynamicImport} = importMap
              const res = await pkgDynamicImport()
              const exportModule = false && "react-dom" === "react"
                ? (res?.default ?? res)
                : {...res}
              // All npm packages pre-built by vite will be converted to esm
              Object.defineProperty(exportModule, "__esModule", {
                value: true,
                enumerable: false
              })
              return function () {
                return exportModule
              }
            },
            shareConfig: {
              singleton: true,
              requiredVersion: "^18.3.0",
              
            }
          }
        ,
          "react-router-dom": {
            name: "react-router-dom",
            version: "7.0.0",
            scope: ["default"],
            loaded: false,
            from: "studioHost",
            async get () {
              if (false) {
                throw new Error(`[Module Federation] Shared module '${"react-router-dom"}' must be provided by host`);
              }
              usedShared["react-router-dom"].loaded = true
              const {"react-router-dom": pkgDynamicImport} = importMap
              const res = await pkgDynamicImport()
              const exportModule = false && "react-router-dom" === "react"
                ? (res?.default ?? res)
                : {...res}
              // All npm packages pre-built by vite will be converted to esm
              Object.defineProperty(exportModule, "__esModule", {
                value: true,
                enumerable: false
              })
              return function () {
                return exportModule
              }
            },
            shareConfig: {
              singleton: true,
              requiredVersion: "^7.0.0",
              
            }
          }
        ,
          "zustand": {
            name: "zustand",
            version: "5.0.0",
            scope: ["default"],
            loaded: false,
            from: "studioHost",
            async get () {
              if (false) {
                throw new Error(`[Module Federation] Shared module '${"zustand"}' must be provided by host`);
              }
              usedShared["zustand"].loaded = true
              const {"zustand": pkgDynamicImport} = importMap
              const res = await pkgDynamicImport()
              const exportModule = false && "zustand" === "react"
                ? (res?.default ?? res)
                : {...res}
              // All npm packages pre-built by vite will be converted to esm
              Object.defineProperty(exportModule, "__esModule", {
                value: true,
                enumerable: false
              })
              return function () {
                return exportModule
              }
            },
            shareConfig: {
              singleton: true,
              requiredVersion: "^5.0.0",
              
            }
          }
        
    }
      const usedRemotes = [
      ]
      export {
        usedShared,
        usedRemotes
      }
      