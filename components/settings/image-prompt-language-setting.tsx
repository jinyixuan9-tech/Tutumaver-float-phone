'use client';
import {useState} from 'react';
import {loadImagePromptLanguage,saveImagePromptLanguage,type ImagePromptLanguage} from '@/lib/image-prompt-language';
export function ImagePromptLanguageSetting(){const [language,setLanguage]=useState(loadImagePromptLanguage);return <section className="settings-option-group"><label className="ai-media-row"><span>图片提示词语言<small className="menu-desc settings-row-description">用于新生成的画面描述，不改写已有提示词</small></span><select aria-label="图片提示词语言" value={language} onChange={e=>{const v=e.target.value as ImagePromptLanguage;saveImagePromptLanguage(v);setLanguage(v);}}><option value="zh">中文</option><option value="en">English</option></select></label></section>;}
