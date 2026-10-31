import React from 'react';
import {act,create} from 'react-test-renderer';
import {expect,it,vi} from 'vitest';
import LocalPlayerMasterPicker from './LocalPlayerMasterPicker';
vi.mock('../data/localPlayerMaster',()=>({readLocalPlayerMaster:async f=>{if(f.bad)throw Error('invalid');return f.master;}}));
it('passes a selected master and clears it on invalid replacement or reset',async()=>{
 const onChange=vi.fn(),onBusy=vi.fn();let view;
 act(()=>{view=create(React.createElement(LocalPlayerMasterPicker,{onChange,onBusy}));});
 const master={asOf:'2026-03-27',players:[{registration:'development'}]};
 const select=file=>view.root.findByType('input').props.onChange({target:{files:[file]}});
 await act(async()=>{await select({master});});
 expect(onChange).toHaveBeenLastCalledWith(master);expect(onBusy).toHaveBeenLastCalledWith(false);
 expect(view.root.findByProps({role:'status'}).children.join('')).toContain('実在1名');
 await act(async()=>{await select({bad:true});});
 expect(onChange).toHaveBeenLastCalledWith(null);expect(view.root.findByProps({role:'alert'}).children).toEqual(['invalid']);
 await act(async()=>{await select({master});});
 act(()=>view.root.findByType('button').props.onClick());expect(onChange).toHaveBeenLastCalledWith(null);
 act(()=>view.unmount());
});
