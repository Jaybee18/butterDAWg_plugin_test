import { AppContextProvider, useAppContext } from '../context/audiocontext';
import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { WaveFile } from 'wavefile';
import './App.css';

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
  const [pluginChain, setPluginChain] = useState<string[]>([]);
  const [soundLibrary, setSoundLibrary] = useState<string[]>([]);
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

    window.electron.ipcRenderer.on("add-plugin", async (_arg) => {
      const arg = (_arg as string[]);
      if (arg.length !== 3) return;
    
      const pluginHtml = arg[0];
      const pluginJs = arg[1];
      const pluginName = arg[2];
    
      const newAudioNode = new AudioWorkletNode(ctx.audioContext, pluginName);
      
      // add the new plugin to the global plugin chain
      if (ctx.pluginChain.length > 0) {
        const prevNode = ctx.pluginChain[ctx.pluginChain.length - 1].audioNode;
        prevNode.disconnect();
        prevNode.connect(newAudioNode);
      }
      ctx.pluginChain.push({
        audioNode: newAudioNode,
        plugin: pluginName,
        id: "i" + uuidv4(),
      });
      newAudioNode.connect(ctx.audioContext.destination);

      updatePluginChain();

      console.log("successfully added plugin html");
    });

    window.electron.ipcRenderer.on("load-sample", async (_arg) => {
      const files = (_arg as string[]);
      for (let i = 0; i < files.length; i+=2) {
        const fileName = files[i];
        const fileContent = files[i + 1];

        const waveFile = new WaveFile();
        waveFile.fromBase64(fileContent);

        ctx.samples[fileName] = waveFile;
      }
      console.log("loaded sample. try again");
    });

    reloadPlugins();
    updatePluginChain();
    reloadSoundLibrary();
  }, []);


  const addPlugin = (plugin: string) => {
    window.electron.ipcRenderer.sendMessage('add-plugin', [plugin]);
  };

  const getPluginWithIdFromChain = (id: string) => {
    return ctx.pluginChain.find(v => v.id === id);
  }

  const isPluginOpen = (id: string) => {
    return document.getElementById(id) !== null;
  }

  const openPlugin = (id: string) => {
    if (isPluginOpen(id)) return;

    const plugin = getPluginWithIdFromChain(id);
    if (plugin === undefined) return;

    const pluginPath = "plugins/" + plugin.plugin;
  
    const htmlPath = pluginPath + "/plugin.html";
    if (!window.electron.existsSync(htmlPath)) return;
    const htmlContent = window.electron.readFileSync(htmlPath, "utf-8");
  
    const hostPath = pluginPath + "/host.js";
    if (!window.electron.existsSync(hostPath)) return;
    const jsContent = window.electron.readFileSync(hostPath, "utf-8");

    // load plugin html
    const container = document.createElement("div");
    // ids have to start with a letter for .querySelector()
    container.id = plugin.id;
    container.classList.add("plugin");
    container.innerHTML = htmlContent;

    document.body.appendChild(container);

    // load plugin js
    const initializePlugin = eval(jsContent);
    initializePlugin(container.id, plugin.audioNode);
  };

  const playSound = (fileName: string) => {
    const path = "sounds/" + fileName;
    if (!Object.keys(ctx.samples).includes(path)) {
      const file = new WaveFile(window.electron.readFileSync(path));
      if (file.bitDepth !== "32f") {
        file.toBitDepth("32f");
      }
      ctx.samples[path] = file;
      console.log("loaded sample");
    }

    let tmp = Float32Array.from(ctx.samples[path].getSamples(true));
    let buffer = ctx.audioContext.createBuffer(2, tmp.length, ctx.audioContext.sampleRate*2);
    buffer.copyToChannel(tmp, 0);
    buffer.copyToChannel(tmp, 1);

    const sourceNode = new AudioBufferSourceNode(ctx.audioContext, {
      buffer: buffer
    })

    if (ctx.pluginChain.length > 0) {
      const firstAudioNode = ctx.pluginChain[0].audioNode;
      sourceNode.connect(firstAudioNode);
      sourceNode.start();
    } else {
      sourceNode.connect(ctx.audioContext.destination);
      sourceNode.start();
    }
  };

  const updatePluginChain = () => {
    const currentChain = ctx.pluginChain.map(v => v.plugin);
    setPluginChain(currentChain);
  };

  const reloadSoundLibrary = () => {
    const currentSounds = window.electron.readdirSync("sounds/");
    setSoundLibrary(currentSounds);
  };

  return (
    <div className='list_container'>
      <div className='plugin_list'>
        <p>Plugin list</p>
        {plugins.map((v, i) => {
          return <button 
          key={i}
          onClick={() => addPlugin(v)}
          >
              {v}
            </button>
        })}
        <button onClick={reloadPlugins}>reload</button>
      </div>
      <div className='plugin_chain'>
        <p>Plugin chain</p>
        {pluginChain.map((v, i) => {
          return <button
            key={i}
            onClick={() => {
              openPlugin(ctx.pluginChain[i].id);
            }}
          >
            {v}
          </button>
        })}
        <button onClick={updatePluginChain}>update</button>
      </div>
      <div className='sound_library'>
        <p>Sound library</p>
        {soundLibrary.map((v, i) => {
          return <button
            key={i}
            onClick={() => {
              playSound(v);
            }}
          >
            {v}
          </button>
        })}
        <button onClick={reloadSoundLibrary}>update</button>
      </div>
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
