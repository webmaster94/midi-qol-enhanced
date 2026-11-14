(async () => {
  const checks=[];
  const check=(name,pass)=>checks.push({name,pass:!!pass});
  const source=game.actors.find(a=>a.name==='Compatibility Caster') ?? game.actors.contents[0];
  const target=game.actors.find(a=>a.name==='Fork Runtime Target');
  const targetToken=canvas.scene.tokens.find(t=>t.actorId===target.id);
  const sourceToken=canvas.scene.tokens.find(t=>t.actorId===source.id);
  let item=source.items.find(i=>i.name==='Integration Regression');
  if(!item) item=(await source.createEmbeddedDocuments('Item',[{name:'Integration Regression',type:'feat',system:{activities:{
    integrationHit01:{_id:'integrationHit01',type:'attack',name:'Hit Trigger',attack:{ability:'str',type:{value:'melee',classification:'weapon'}},target:{affects:{type:'creature',count:'1'},prompt:false},midiProperties:{triggeredActivityId:'integrationTick1',triggeredActivityTargets:'self'}},
    integrationTick1:{_id:'integrationTick1',type:'save',name:'Integration Repeat Save',isOverTimeFlag:true,overTimeProperties:{saveRemoves:true},save:{ability:['con'],dc:{calculation:'',formula:'10'}},target:{affects:{type:'creature',count:'1'},prompt:false}}
  }}}]))[0];
  await item.system.activities.get('integrationHit01').update({'midiProperties.triggeredActivityTargets':'self','midiProperties.triggeredActivityRollAs':'self'});
  const activity=item.system.activities.get('integrationHit01');
  const child=item.system.activities.get('integrationTick1');
  const workflow=new MidiQOL.Workflow(source,activity,ChatMessage.getSpeaker({actor:source}),[targetToken],{storeWorkflow:false});
  workflow.hitTargets=new Set([targetToken]);
  workflow.failedSaves=new Set([targetToken]);
  const controllers=()=>[...source.effects,...target.effects].filter(e=>e.flags['midi-qol']?.autoOverTime?.activityUuid===child.uuid);
  const cleanup=async()=>{for(const e of controllers())await e.delete();};
  await cleanup();
  await workflow.runTriggeredActivity();
  check('successful attack creates self controller',source.effects.some(e=>e.flags['midi-qol']?.autoOverTime?.activityUuid===child.uuid));
  await cleanup();
  workflow.hitTargets=new Set();
  await workflow.runTriggeredActivity();
  check('miss does not create self controller',controllers().length===0);
  workflow.hitTargets=new Set([targetToken]);
  await activity.update({'midiProperties.triggeredActivityRollAs':'firstTarget'});
  workflow.activity=item.system.activities.get(activity.id);
  await workflow.runTriggeredActivity();
  check('first-target roll mode retains self recipient',source.effects.some(e=>e.flags['midi-qol']?.autoOverTime?.activityUuid===child.uuid));
  await cleanup();
  await workflow.activity.update({'midiProperties.triggeredActivityTargets':'retarget'});
  workflow.activity=item.system.activities.get(activity.id);

  await workflow.runTriggeredActivity();
  check('retarget opens native confirmation',globalThis.midiRetargetDialogSeen);
  check('retarget creates controller on selected caster',source.effects.some(e=>e.flags['midi-qol']?.autoOverTime?.activityUuid===child.uuid));
  await cleanup();
  await workflow.activity.update({'midiProperties.triggeredActivityTargets':'self','midiProperties.triggeredActivityRollAs':'self'});
  workflow.activity=item.system.activities.get(activity.id);
  let second=canvas.scene.tokens.find(t=>t.name==='Integration Second Linked Token');
  if(!second) second=(await canvas.scene.createEmbeddedDocuments('Token',[(await target.getTokenDocument({x:650,y:500,actorLink:true,name:'Integration Second Linked Token'})).toObject()]))[0];
  const originalCreate=workflow.createMacroFromResolved;
  let captured;
  workflow.createMacroFromResolved=()=>({command:'capture',execute:scope=>{captured=scope;}});
  try {
    for(const token of [second.object,second]){
      await workflow.executeMacroWithScope({}, {}, {actor:target,token}, item);
      check(`macro keeps exact ${token instanceof TokenDocument?'document':'placeable'}`,captured.token===token);
    }
    let scene=game.scenes.find(s=>s.name==='Integration Off-Canvas');
    if(!scene) scene=await Scene.create({name:'Integration Off-Canvas',width:1000,height:1000,grid:{size:100}});
    let offscene=scene.tokens.find(t=>t.actorId===target.id);
    if(!offscene) offscene=(await scene.createEmbeddedDocuments('Token',[(await target.getTokenDocument({actorLink:true})).toObject()]))[0];
    await workflow.executeMacroWithScope({}, {}, {actor:target,token:offscene}, item);
    check('macro keeps off-canvas document',captured.token===offscene);
  } finally {workflow.createMacroFromResolved=originalCreate;}
  return {pass:checks.every(c=>c.pass),checks};
})()
