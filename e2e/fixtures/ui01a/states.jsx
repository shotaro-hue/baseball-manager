import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/styles.css';
import '../../../src/calm-ui.css';
import '../../../src/mobile-flow.css';
import { Button, StateLabel, MetricBand, Section, DataTableFrame } from '../../../src/components/design-system/primitives';
createRoot(document.getElementById('root')).render(<main style={{padding:16,maxWidth:1320,margin:'auto'}}>
  <MetricBand items={[
    {label:'実測0',value:0},
    {label:'未記録',value:null},
    {label:'算出不可',value:null,state:'unavailable',reason:'投球回0'},
    {label:'対象外',value:null,state:'excluded'},
  ]}/>
  <Section title="処理と保存の状態">
    <StateLabel tone="processing">試合を処理中</StateLabel>{' '}
    <StateLabel tone="success">保存済み</StateLabel>{' '}
    <StateLabel tone="warning">保存待ち</StateLabel>{' '}
    <StateLabel tone="danger">保存失敗</StateLabel>
  </Section>
  <Section title="長い名前と局所スクロール">
    <DataTableFrame label="表示検証の表"><table style={{minWidth:600}}><thead><tr><th>選手</th><th data-number>本塁打</th><th data-number>打点</th><th>状態</th></tr></thead><tbody>
      <tr className="selected"><td><button>とても長い選手名を省略せずに表示するテスト</button></td><td data-number>0</td><td data-number>0</td><td>一軍成績</td></tr>
    </tbody></table></DataTableFrame>
    <Button onClick={()=>{document.body.dataset.activated='true';}}>確認する</Button>{' '}<Button variant="secondary" disabled>処理中</Button>
  </Section>
</main>);
