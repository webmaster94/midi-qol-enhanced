import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import fs from 'node:fs';
import ts from 'typescript';

const text = fs.readFileSync(new URL('../src/module/Workflow.ts', import.meta.url), 'utf8');
const file = ts.createSourceFile('Workflow.ts', text, ts.ScriptTarget.Latest, true);
const workflowClass = file.statements.find(n => ts.isClassDeclaration(n) && n.name.text === 'Workflow');
function method(name) {
  const node = workflowClass.members.find(n => n.name?.getText(file) === name);
  assert.ok(node, name);
  return ts.transpile(`class Subject {${node.getText(file)}}\nglobalThis.Subject = Subject;`, {target:ts.ScriptTarget.ES2022});
}
class TokenDocument { constructor(uuid) {this.uuid=uuid;this.id=uuid.split('.').at(-1);} }
class Token { constructor(document) {this.document=document;document.object=this;} }
function context(extra={}) {
  const sandbox=vm.createContext({exports:{},TokenDocument,foundry:{canvas:{placeables:{Token}},utils:{
    setProperty(object,path,value) {const keys=path.split('.');const last=keys.pop();for(const key of keys)object=object[key]??={};object[last]=value;}
  }},...extra});
  vm.runInContext(ts.transpile(fs.readFileSync(new URL('../src/module/lib/tokenDocumentSet.ts',import.meta.url),'utf8'),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}),sandbox);
  Object.assign(sandbox,sandbox.exports);
  return sandbox;
}
function triggerFixture({mode='self',attack=true,save=true,hit=true,failed=true,ignore=false,rollAs='self',confirm=true}={}) {
  const applied=[],calls=[],prompts=[];
  const self=new TokenDocument('Scene.s.Token.self'), target=new TokenDocument('Scene.s.Token.target'), other=new TokenDocument('Scene.s.Token.other');
  const actor={uuid:'Actor.source',isOwner:true};target.actor={uuid:'Actor.target',isOwner:true};other.actor={uuid:'Actor.other',isOwner:true};
  const child={uuid:'Activity.child',isOverTimeFlag:true,overTimeProperties:{ignoreTriggeringActivitySaveHit:ignore},getTriggeredActivity:async()=>undefined};
  const activity={uuid:'Activity.parent',attack:attack?{}:undefined,midiProperties:{triggeredActivityId:'child',triggeredActivityTargets:mode,triggeredActivityRollAs:rollAs},getTriggeredActivity:async()=>child};
  const ctx=context({ui:{notifications:{error:()=>{}}},game:{user:{targets:new Set([other])}},getActor:token=>token?.actor,
    inheritableWorkflowOptions:x=>x,applyTriggeredActivityAsOverTime:async(...args)=>applied.push(args),completeActivityUse:async(...args)=>calls.push(args),
    resolveTargetConfirmation:async(...args)=>{prompts.push(args);return confirm;},fromUuid:async uuid=>[self,target,other].find(d=>d.uuid===uuid),
    createConditionData:x=>x,evalCondition:async()=>true});
  vm.runInContext(method('runTriggeredActivity'),ctx);
  const set=docs=>new ctx.TokenDocumentSet(docs);
  const workflow=Object.assign(new ctx.Subject(),{activity,actor,tokenUuid:self.uuid,rollOptions:{},workflowOptions:{},targets:set([target]),hitTargets:set(hit?[target]:[]),hitTargetsEC:set([]),failedSaves:set(failed?[target]:[]),saves:set(failed?[]:[target]),saveActivity:save?{save:{}}:undefined});
  return {workflow,ctx,applied,calls,prompts,self,target,other,child};
}
for(const kind of ['attack','save','attack+save']) {
  test(`${kind}: successful trigger can put OverTime on self`,async()=>{
    const f=triggerFixture({attack:kind!=='save',save:kind!=='attack'});await f.workflow.runTriggeredActivity();
    assert.deepEqual(Array.from(f.applied[0]?.[2]??[]),[f.self.uuid]);
  });
}
test('miss or successful enemy save does not trigger self OverTime',async()=>{
  for(const options of [{hit:false},{failed:false},{attack:false,failed:false}]) {const f=triggerFixture(options);await f.workflow.runTriggeredActivity();assert.equal(f.applied.length,0);}
});
test('original recipients still exclude saves and misses',async()=>{
  const f=triggerFixture({mode:'targets'});f.workflow.targets.add(f.other);await f.workflow.runTriggeredActivity();
  assert.deepEqual(Array.from(f.applied[0][2]),[f.target.uuid]);
});
test('self recipient is independent of first-target roll-as modes',async()=>{
  for(const rollAs of ['firstTarget','firstHitTarget','firstFailedSaveTarget']) {const f=triggerFixture({rollAs});await f.workflow.runTriggeredActivity();assert.deepEqual(Array.from(f.applied[0]?.[2]??[]),[f.self.uuid]);}
});
test('self without a placed caster token uses its actor UUID',async()=>{
  const f=triggerFixture();f.workflow.tokenUuid=undefined;await f.workflow.runTriggeredActivity();assert.deepEqual(Array.from(f.applied[0]?.[2]??[]),[f.workflow.actor.uuid]);
});
test('retarget OverTime confirms the recipient independently of the triggering target',async()=>{
  const f=triggerFixture({mode:'retarget'});await f.workflow.runTriggeredActivity();assert.equal(f.prompts.length,1);assert.deepEqual(Array.from(f.applied[0]?.[2]??[]),[f.other.uuid]);
});
test('cancelled retarget and ineligible trigger create no controller',async()=>{
  const cancelled=triggerFixture({mode:'retarget',confirm:false});await cancelled.workflow.runTriggeredActivity();assert.equal(cancelled.applied.length,0);
  const missed=triggerFixture({mode:'retarget',hit:false});await missed.workflow.runTriggeredActivity();assert.equal(missed.applied.length,0);assert.equal(missed.prompts.length,0);
});
test('ignore-trigger outcome bypass also works for self and retarget',async()=>{
  for(const mode of ['self','retarget']) {const f=triggerFixture({mode,ignore:true,hit:false,failed:false});await f.workflow.runTriggeredActivity();assert.equal(f.applied.length,1);}
});
for(const documentMode of [false,true]) {
  test(`macro scope keeps the exact linked token in document mode ${documentMode}`,()=>{
    const wrong=new Token(new TokenDocument('Scene.s.Token.wrong'));const intended=new Token(new TokenDocument('Scene.s.Token.intended'));
    const ctx=context({tokenForActor:()=>wrong});ctx.setupTokenSetMode(documentMode);vm.runInContext(method('executeMacroWithScope'),ctx);
    let scope;const workflow=Object.assign(new ctx.Subject(),{actor:{},createMacroFromResolved:()=>({command:'test',execute:s=>{scope=s;}})});
    workflow.executeMacroWithScope({}, {}, {token:documentMode?intended.document:intended}, {});
    assert.equal(scope.token,documentMode?intended.document:intended);
  });
}
test('macro scope keeps undrawn target and only uses actor fallback when no token supplied',()=>{
  const wrong=new Token(new TokenDocument('Scene.s.Token.wrong')),undrawn=new TokenDocument('Scene.other.Token.target');
  const ctx=context({tokenForActor:()=>wrong});vm.runInContext(method('executeMacroWithScope'),ctx);
  let scope;const workflow=Object.assign(new ctx.Subject(),{actor:{},createMacroFromResolved:()=>({command:'test',execute:s=>{scope=s;}})});
  workflow.executeMacroWithScope({}, {}, {token:undrawn}, {});assert.equal(scope.token,undrawn);
  workflow.executeMacroWithScope({}, {}, {}, {});assert.equal(scope.token,wrong);
});
