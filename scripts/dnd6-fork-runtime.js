(async () => {
  const checks = [];
  const check = (name, pass, detail) => checks.push({name, pass: !!pass, detail});
  const source = game.actors.find(a => a.name === 'Compatibility Caster') ?? game.actors.contents[0];
  let target = game.actors.find(a => a.name === 'Fork Runtime Target');
  if (!target) target = await Actor.create({name:'Fork Runtime Target',type:'npc',system:{attributes:{hp:{value:100,max:100}}}});
  if (!canvas.scene.tokens.some(t => t.actorId === target.id)) await canvas.scene.createEmbeddedDocuments('Token',[(await target.getTokenDocument({x:500,y:500,actorLink:true})).toObject()]);
  if (!canvas.scene.tokens.some(t => t.actorId === source.id)) await canvas.scene.createEmbeddedDocuments('Token',[(await source.getTokenDocument({x:100,y:100,actorLink:true})).toObject()]);
  let item=source.items.find(i=>i.name==='Fork Runtime Trigger');
  if (!item) item=(await source.createEmbeddedDocuments('Item',[{name:'Fork Runtime Trigger',type:'feat',system:{activities:{
    forkTrigger00001:{_id:'forkTrigger00001',type:'utility',name:'Trigger',activation:{type:'action'},target:{affects:{type:'creature',count:'1'},prompt:false},midiProperties:{triggeredActivityId:'forkOvertime0001',triggeredActivityTargets:'targets',triggeredActivityRollAs:'self'}},
    forkOvertime0001:{_id:'forkOvertime0001',type:'save',name:'Repeat Save',identifier:'forkOvertime',isOverTimeFlag:true,overTimeProperties:{turnChoice:'start',saveRemoves:true,removeTriggeringActivityEffects:true},save:{ability:['con'],dc:{calculation:'',formula:'10'}},target:{affects:{type:'creature',count:'1'},prompt:false}}
  }}}]))[0];
  const trigger=item.system.activities.get('forkTrigger00001');
  const repeat=item.system.activities.get('forkOvertime0001');
  check('custom OverTime schema survives preparation', repeat.overTimeProperties.removeTriggeringActivityEffects === true && repeat.overTimeProperties.ignoreTriggeringActivitySaveHit === false);
  const parent=(await target.createEmbeddedDocuments('ActiveEffect',[{name:'Runtime Parent Condition',statuses:['poisoned'],duration:{seconds:60,startTime:game.time.worldTime},system:{origin:{activity:trigger.uuid,item:item.uuid,actor:source.uuid},changes:[]}}]))[0];
  const workflow = new MidiQOL.Workflow(source,trigger,ChatMessage.getSpeaker({actor:source}),[canvas.scene.tokens.find(t=>t.actorId===target.id)],{storeWorkflow:false});
  workflow.itemCardUuid = game.messages.contents.findLast(m=>m.system?.activity)?.uuid;
  await workflow.runTriggeredActivity();
  let controllers=target.effects.filter(e=>e.flags['midi-qol']?.autoOverTime?.activityUuid===repeat.uuid);
  check('trigger creates one persistent OverTime controller',controllers.length===1,controllers.map(e=>e.toObject()));
  if(controllers.length){
    check('controller uses native v14 effect changes',controllers[0].system.changes[0].type==='override');
    check('controller inherits source effect duration',controllers[0].duration.seconds===60);
    check('controller follows source effect dependency',controllers[0].flags.dnd5e?.dependentOn===parent.uuid);
    await workflow.runTriggeredActivity();
    check('retrigger refreshes existing controller',target.effects.filter(e=>e.flags['midi-qol']?.autoOverTime?.activityUuid===repeat.uuid).length===1);
  }
  await game.settings.set('midi-qol','ConditionUpdateCard','gm');
  const effect=(await target.createEmbeddedDocuments('ActiveEffect',[{name:'Runtime Notification',statuses:['blinded'],system:{changes:[]}}]))[0];
  await new Promise(resolve=>setTimeout(resolve,650));
  const added=game.messages.contents.findLast(m=>m.flags['midi-qol']?.conditionUpdateData?.updates?.some(u=>u.effectUuid===effect.uuid && u.operation==='Added'));
  check('condition addition creates grouped GM notification',!!added);
  check('GM notification stays whispered',!!added?.whisper?.length && added.whisper.every(id=>game.users.get(id)?.isGM));
  await effect.delete();
  await new Promise(resolve=>setTimeout(resolve,650));
  check('condition removal creates notification',game.messages.some(m=>m.flags['midi-qol']?.conditionUpdateData?.updates?.some(u=>u.effectUuid===effect.uuid && u.operation==='Removed')));
  const settingExport=MidiQOL.collectSettingData?.();
  if(settingExport) check('condition notification setting exports',settingExport.conditionUpdateCard==='gm');
  const activitySheet=repeat.sheet;
  await activitySheet.render({force:true});
  check('OverTime options render in activity configuration',!!activitySheet.element.querySelector('[name="overTimeProperties.removeTriggeringActivityEffects"]'));
  await activitySheet.close();
  if(added){
    const html=await added.renderHTML();
    document.querySelector('#midi-compatibility-preview').append(html);
    check('condition card renders effect name',html.textContent.includes('Runtime Notification'));
    check('condition card renders actor name',html.textContent.includes(target.name));
  }
  // A native area is a Region in D&D 6, and must be accepted by the workflow.
  let area=source.items.find(i=>i.name==='Fork Runtime Area');
  if(!area) area=(await source.createEmbeddedDocuments('Item',[{name:'Fork Runtime Area',type:'feat',system:{activities:{forkArea00000001:{_id:'forkArea00000001',type:'utility',range:{units:'self'},target:{template:{type:'radius',size:'10',units:'ft'},affects:{type:'creature'},prompt:false},midiProperties:{autoTargetAction:'always'}}}}}]))[0];
  const areaActivity=area.system.activities.contents[0];
  const areaWorkflow=new MidiQOL.Workflow(source,areaActivity,ChatMessage.getSpeaker({actor:source}),[],{storeWorkflow:false});
  const regions=await areaActivity._placeEmanationTemplate(areaWorkflow);
  check('area placement creates native Region',regions?.[0] instanceof RegionDocument);
  if(regions?.length){
    check('area workflow accepts native Region',await areaWorkflow.processPlacedTemplates(regions,areaActivity));
    for(const region of regions) await region.delete();
  }
  await parent.delete();
  check('deleting source effect removes OverTime dependent',!target.effects.some(e=>e.flags['midi-qol']?.autoOverTime?.activityUuid===repeat.uuid));
  return {pass:checks.every(c=>c.pass),checks};
})()
