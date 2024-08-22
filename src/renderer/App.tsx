import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import icon from '../../assets/icon.svg';
import './App.css';
import { useContext, useEffect, useState } from 'react';
import { AppContextProvider, useAppContext } from '../context/audiocontext';
import { v4 as uuidv4 } from 'uuid';

// https://stackoverflow.com/questions/3115982/how-to-check-if-two-arrays-are-equal-with-javascript
function arraysEqual(a: any[], b: any[], compareFnc: ((a: string, b: string) => number)) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length !== b.length) return false;

  // If you don't care about the order of the elements inside
  // the array, you should sort both arrays here.
  // Please note that calling sort on an array will modify that array.
  // you might want to clone your array first.
  const a_copy = a.slice(0).sort(compareFnc);
  const b_copy = b.slice(0).sort(compareFnc);

  for (var i = 0; i < a_copy.length; ++i) {
    if (a_copy[i] !== b_copy[i]) return false;
  }
  return true;
}

function Hello() {
  const [plugins, setPlugins] = useState<string[]>([]);
  const ctx = useAppContext();


  const reloadPlugins = () => {
    // calling IPC exposed from preload script
    window.electron.ipcRenderer.once('ipc-example', async (arg) => {
      // eslint-disable-next-line no-console
      const shouldState = (arg as string[]).sort((a, b) => a.localeCompare(b));
      const isState = plugins.sort((a, b) => a.localeCompare(b));
      let unloadedPlugins = shouldState.slice(0);
      
      for (let i = 0; i < isState.length; i++) {
        const index = unloadedPlugins.indexOf(isState[i]);
        if (index !== -1) {
          unloadedPlugins.splice(index, 1);
        }
      }

      if (arraysEqual(shouldState, isState, (a, b) => a.localeCompare(b))) {
        console.log("plugins are up to date");
        return;
      }

      // actually register the unloaded plugins to the audio worklet
      for (let i = 0; i < unloadedPlugins.length; i++) {
        const plugin = unloadedPlugins[i];

        if (ctx.loadedPlugins.includes(plugin)) {
          continue;
        }

        window.electron.ipcRenderer.sendMessage('get-plugin-content', [plugin]);
        
        ctx.loadedPlugins.push(plugin);
      }
      console.log("loaded: ", unloadedPlugins);

      setPlugins(shouldState);
      console.log("plugin list updated");
    });

    window.electron.ipcRenderer.sendMessage('ipc-example');
  };

  // this useEffect hook wil only run once!
  useEffect(() => {
    window.electron.ipcRenderer.on("get-plugin-content", async (_arg) => {
      const arg = (_arg as string[]);
      if (arg.length !== 1) return;
    
      const pluginContent = arg[0];
    
      const blob = new Blob([pluginContent], {type: "application/javascript; charset=utf-8"});
      const workletUrl = window.URL.createObjectURL(blob);
      await ctx.audioContext.audioWorklet.addModule(workletUrl);
    
      console.log("successfully added module " + workletUrl);
    });

    window.electron.ipcRenderer.on("get-plugin", async (_arg) => {
      const arg = (_arg as string[]);
      if (arg.length !== 3) return;
    
      const pluginHtml = arg[0];
      const pluginJs = arg[1];
      const pluginName = arg[2];
    
      // load plugin html
      const container = document.createElement("div");
      container.id = uuidv4();
      container.classList.add("plugin");
      container.innerHTML = pluginHtml;

      document.body.appendChild(container);

      // load and execute plugin js
      // console.log(Function(pluginJs)());

      const plugin = eval(pluginJs);
      plugin(container.id, new AudioWorkletNode(ctx.audioContext, pluginName));

      // @ts-ignore
      // plugin(container.id, "SimpleDistortion");

      console.log("successfully added plugin html");
    });
  }, []);

  useEffect(() => {
    reloadPlugins();
  });

  const openPlugin = (plugin:string) => {
    window.electron.ipcRenderer.sendMessage('get-plugin', [plugin]);
  };

  return (
    <div className='plugin_list'>
      {plugins.map(v => {
        return <button 
            key={plugins.indexOf(v)}
            onClick={() => openPlugin(v)}
          >
            {v}
          </button>
      })}
      <button onClick={reloadPlugins}>reload</button>
    </div>
  );
}
export default function App() {
  return (
    <AppContextProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Hello />} />
        </Routes>
      </Router>
    </AppContextProvider>
  );
}
