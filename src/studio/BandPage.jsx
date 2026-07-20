import { useMemo } from "react";
import BandChatPage from "../BandChatPage.jsx";
import { mockBandChats, mockBandMembers } from "./mockData.js";

/**
 * Studio Bend — Viber-style group chat shell fed by mock threads.
 */
export default function BandPage({ band, viewerRole = "member" }) {
  const members = mockBandMembers[band?.id] || [];
  const messages = useMemo(() => mockBandChats[band?.id] || [], [band?.id]);

  return (
    <BandChatPage
      band={band}
      members={members}
      messages={messages}
      viewerRole={viewerRole}
    />
  );
}
