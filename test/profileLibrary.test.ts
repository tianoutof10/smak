import assert from 'node:assert/strict'
import test from 'node:test'
import { filterLibraryProfiles, librarySaveMetadata, profileLibrarySource, sourceForRecord } from '../src/features/profiles/profileLibraryModel.ts'
import { profileRecordsToDomain } from '../src/api/decaid/adapters.ts'
import type { BrewProfile } from '../src/domain/brewing'
const base = {temperature:'92',grindSetting:'—',dose:'18',targetYield:'36'}
test('profile origins are explicit, with honest fallback for legacy records',()=>{
  assert.equal(sourceForRecord({isDefault:true,metadata:{smakSource:'imported'}}),'Built-in')
  assert.equal(sourceForRecord({isDefault:false,metadata:{smakSource:'imported'}}),'Imported')
  assert.equal(sourceForRecord({isDefault:false,metadata:{smakSource:'created'}}),'Created')
  assert.equal(sourceForRecord({isDefault:false}),'Saved')
  assert.equal(sourceForRecord({}),'Saved')
})
test('save provenance preserves existing metadata and dates; copies are newly created',()=>{
  const metadata={description:'notes',smakSource:'imported',smakCreatedAt:'2026-01-01'}
  assert.deepEqual(librarySaveMetadata({description:'updated'},{metadata},true,'2026-09-14'),{...metadata,description:'updated'})
  assert.equal(librarySaveMetadata(metadata,undefined,false,'2026-09-14').smakSource,'imported')
  assert.equal(librarySaveMetadata(null,{metadata},false,'2026-09-14').smakSource,'created')
  assert.equal(librarySaveMetadata(null,undefined,false,'2026-09-14').smakCreatedAt,'2026-09-14')
})
test('library filters, search, deterministic sort and unknown-date fallback',()=>{
  const profiles:BrewProfile[]=[
    {...base,id:'a',name:'Zulu',category:'Turbo',source:'Created',createdAt:'2026-09-14'},
    {...base,id:'b',name:'Alpha',category:'Classic',source:'Imported',createdAt:'2026-09-01',description:'Chocolate finish'},
    {...base,id:'c',name:'Legacy',source:'Saved'},
  ]
  const defaults={section:'All profiles' as const,query:'',category:'',sort:'name' as const}
  assert.deepEqual(filterLibraryProfiles(profiles,defaults).map(p=>p.id),['b','c','a'])
  assert.deepEqual(filterLibraryProfiles(profiles,{...defaults,sort:'recent'}).map(p=>p.id),['a','b','c'])
  assert.equal(filterLibraryProfiles(profiles,{...defaults,query:' chocolate '})[0].id,'b')
  assert.equal(filterLibraryProfiles(profiles,{...defaults,section:'My profiles',category:'Turbo'})[0].id,'a')
  assert.equal(filterLibraryProfiles(profiles,{...defaults,section:'My profiles',category:'Classic'}).length,0)
  assert.deepEqual(filterLibraryProfiles(profiles,{...defaults,section:'My profiles'}).map(p=>p.id),['c','a'])
})
test('library groups preloaded, imported, and created or saved profiles without changing provenance',()=>{
  const profile:BrewProfile={...base,id:'group-test',name:'Recipe'}
  assert.equal(profileLibrarySource({...profile,source:'Built-in'}),'Preloaded')
  assert.equal(profileLibrarySource({...profile,source:'Imported'}),'Imported')
  assert.equal(profileLibrarySource({...profile,source:'Created'}),'My profiles')
  assert.equal(profileLibrarySource({...profile,source:'Saved'}),'My profiles')
  assert.equal(profileLibrarySource(profile),'My profiles')
})
test('real records retain actual graphs, metadata and missing targets',()=>{
  const profiles=profileRecordsToDomain([{id:'real',isDefault:false,metadata:{smakSource:'imported',smakCreatedAt:'2026-09-14'},profile:{title:'Test',author:'Me',steps:[{name:'Brew',pump:'pressure',pressure:7,seconds:20,temperature:94}]}}],{},[])
  assert.equal(profiles[0].source,'Imported')
  assert.equal(profiles[0].author,'Me')
  assert.equal(profiles[0].targetYield,'—')
  assert.ok(profiles[0].targetPoints?.length)
})
