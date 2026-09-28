import { NextResponse } from "next/server";

type Campaign={name:string;topic:string;goal:string;audience:string;talking_points:string;tone:string;personalization_instructions:string};
type Prospect={name:string;company:string;email:string;reason:string};

function required(name:string){const v=process.env[name]?.trim();if(!v)throw new Error("Missing "+name);return v;}

export async function POST(request:Request){
  try{
    const {campaign,prospect}=await request.json() as {campaign:Campaign;prospect:Prospect};
    if(!campaign?.topic||!prospect?.email) return NextResponse.json({error:"Campaign topic and prospect are required."},{status:400});
    const apiKey=required("GEMINI_API_KEY");
    const prompt="You write concise, credible B2B outreach emails. Follow the campaign exactly. Never invent facts, achievements, partnerships, metrics, funding, customers, or personal details about the prospect. Use only the supplied prospect information. Do not mention that AI was used.\n\nCAMPAIGN\nName: "+campaign.name+"\nTopic: "+campaign.topic+"\nGoal: "+campaign.goal+"\nAudience: "+campaign.audience+"\nTalking points: "+campaign.talking_points+"\nTone: "+campaign.tone+"\nPersonalization instructions: "+campaign.personalization_instructions+"\n\nPROSPECT\nName: "+prospect.name+"\nCompany: "+prospect.company+"\nKnown reason for outreach: "+prospect.reason+"\n\nReturn ONLY valid JSON with this shape: {"subject":"...","body":"...","personalization_note":"..."}. The body should be 100-160 words, natural, specific to the supplied information, and end with one simple call to action.";
    const response=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key="+encodeURIComponent(apiKey),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.5,responseMimeType:"application/json"}})});
    const data:any=await response.json();
    if(!response.ok) return NextResponse.json({error:"AI generation failed: "+(data.error?.message??"Unknown provider error")},{status:502});
    const raw=data.candidates?.[0]?.content?.parts?.[0]?.text;
    if(!raw) return NextResponse.json({error:"AI returned no draft."},{status:502});
    const draft=JSON.parse(raw);
    if(typeof draft.subject!=="string"||typeof draft.body!=="string") throw new Error("AI returned an invalid draft.");
    return NextResponse.json({subject:draft.subject.trim(),body:draft.body.trim(),personalization_note:typeof draft.personalization_note==="string"?draft.personalization_note.trim():""});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Draft generation failed."},{status:500});}
}
