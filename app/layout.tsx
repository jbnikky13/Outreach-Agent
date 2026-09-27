import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata={title:"Outreach Agent",description:"AI-assisted email outreach with human approval before sending."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}