// Synthetic test data only, using the unchanged RawStoryAnalysis field names.
export function analysisFixture() {
  return {
    schema_version: '1.0', document_id: 'test-story',
    characters: [
      { id: 'a', name: '王佳芝', aliases: ['麦太太'], description: '仅用于前端测试的人物简介，不是原文分析。' },
      { id: 'b', name: '易先生', aliases: [], description: '测试人物；同一对人物存在多种独立关系。' },
      { id: 'c', name: '邝裕民', aliases: ['二哥'], description: '测试角色的行动同伴。' },
      { id: 'isolated', name: '无关系人物', aliases: [], description: '' },
    ],
    relations: [
      { id: 'r1', source_character_id: 'a', target_character_id: 'b', type: '秘密亲密关系', description: '第一条独立关系的完整描述。' },
      { id: 'r2', source_character_id: 'b', target_character_id: 'a', type: '行动目标', description: '反向关系，不能与同向记录合并。' },
      { id: 'r3', source_character_id: 'a', target_character_id: 'b', type: '掩护性交往', description: '第三条独立关系。' },
      { id: 'r4', source_character_id: 'a', target_character_id: 'c', type: '行动同伴', description: '同伴。' },
      { id: 'r5', source_character_id: 'a', target_character_id: 'a', type: '内心冲突', description: '自环关系测试。' },
      { id: 'r6', source_character_id: 'a', target_character_id: 'a', type: '身份矛盾', description: '第二条自环关系。' },
    ],
    events: [], timeline_constraints: [], evidences: [], warnings: [],
  };
}
