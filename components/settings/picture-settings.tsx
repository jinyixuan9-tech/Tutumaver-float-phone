'use client';
import {useContext,useEffect} from 'react';
import {SettingsContext} from '../phone-settings-app';
import {TextImageMaskSetting} from './text-image-mask-setting';
import {ImagePromptLanguageSetting} from './image-prompt-language-setting';
/** Keep shared-edition AI behavior and generation-prompt screens unchanged. */
export function PictureSettings(){
 const {setSubpageTitle}=useContext(SettingsContext);
 useEffect(()=>{setSubpageTitle('图片设置');return()=>setSubpageTitle(null);},[setSubpageTitle]);
 return <div className="ai-behavior-page flex flex-col gap-4">
   <TextImageMaskSetting/>
   <ImagePromptLanguageSetting/>
   <p className="menu-desc ai-media-note">自定义遮罩在所有文字图中同步生效；这里的语言设置只影响之后新生成的图片描述，不更改已有图片和正文。</p>
 </div>;
}
