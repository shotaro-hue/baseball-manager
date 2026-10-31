import React from 'react';
import {act,create} from 'react-test-renderer';
import {beforeEach,expect,it,vi} from 'vitest';
import LocalPlayerMasterPicker from './LocalPlayerMasterPicker';
import {hasRememberedPlayerMaster,canRememberPlayerMaster,loadRememberedPlayerMaster,rememberPlayerMaster,forgetPlayerMaster} from '../data/rememberedPlayerMaster';
vi.mock('../data/rememberedPlayerMaster',()=>({hasRememberedPlayerMaster:vi.fn(()=>false),canRememberPlayerMaster:vi.fn(()=>false),loadRememberedPlayerMaster:vi.fn(async()=>null),rememberPlayerMaster:vi.fn(async()=>{}),forgetPlayerMaster:vi.fn(async()=>{})}));
beforeEach(()=>{vi.clearAllMocks();canRememberPlayerMaster.mockReturnValue(false);hasRememberedPlayerMaster.mockReturnValue(false);});
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
 await act(async()=>{await view.root.findByType('button').props.onClick();});expect(onChange).toHaveBeenLastCalledWith(null);
 act(()=>view.unmount());
});

it('restores remembered selection before releasing the title lock',async()=>{
 canRememberPlayerMaster.mockReturnValue(true);hasRememberedPlayerMaster.mockReturnValue(true);let finish;loadRememberedPlayerMaster.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));
 const onChange=vi.fn(),onBusy=vi.fn();let view;
 act(()=>{view=create(React.createElement(LocalPlayerMasterPicker,{onChange,onBusy}));});
 expect(onBusy).toHaveBeenLastCalledWith(true);expect(onChange).not.toHaveBeenCalled();
 const master={asOf:'2026-03-27',players:[{registration:'development'}]};
 await act(async()=>{finish(master);});
 expect(onChange).toHaveBeenLastCalledWith(master);expect(onBusy).toHaveBeenLastCalledWith(false);
 expect(view.root.findByType('summary').children.join('')).toContain('記憶済み');
 act(()=>view.unmount());
});
it('does not claim persistence after a failed write, and forgets before an invalid replacement',async()=>{
 canRememberPlayerMaster.mockReturnValue(true);hasRememberedPlayerMaster.mockReturnValue(true);rememberPlayerMaster.mockRejectedValueOnce(Error('quota'));
 const onChange=vi.fn();let view;
 await act(async()=>{view=create(React.createElement(LocalPlayerMasterPicker,{onChange,onBusy:vi.fn()}));});
 const master={asOf:'2026-03-27',players:[]};
 await act(async()=>{await view.root.findByType('input').props.onChange({target:{files:[{master}]}});});
 expect(onChange).toHaveBeenLastCalledWith(master);expect(view.root.findByType('summary').children.join('')).not.toContain('記憶済み');
 expect(view.root.findByProps({role:'alert'}).children.join('')).toContain('記憶に失敗');
 await act(async()=>{await view.root.findByType('input').props.onChange({target:{files:[{bad:true}]}});});
 expect(forgetPlayerMaster).toHaveBeenCalledTimes(2);expect(onChange).toHaveBeenLastCalledWith(null);
 act(()=>view.unmount());
});
it('does not apply a delayed restore after unmount',async()=>{
 canRememberPlayerMaster.mockReturnValue(true);hasRememberedPlayerMaster.mockReturnValue(true);let finish;loadRememberedPlayerMaster.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));
 const onChange=vi.fn();let view;
 act(()=>{view=create(React.createElement(LocalPlayerMasterPicker,{onChange,onBusy:vi.fn()}));});act(()=>view.unmount());
 await act(async()=>{finish({players:[]});});expect(onChange).not.toHaveBeenCalled();
});
