import React from 'react';
import Link from 'next/link';
import { getGuildInfo } from '@/lib/discord';

const SECTIONS = [
  { name: 'Overview', path: 'Overview', category: 'General' },
  { name: 'Setup', path: 'Setup', category: 'General' },
  { name: 'Features', path: 'Features', category: 'General' },
  { name: 'Server', path: 'Server', category: 'General' },
  { name: 'Members', path: 'Members', category: 'Server Management' },
  { name: 'Leveling', path: 'Leveling', category: 'Features' },
  { name: 'Security', path: 'Security', category: 'Features' },
  { name: 'Logs', path: 'Logs', category: 'Features' },
  { name: 'Tickets', path: 'Tickets', category: 'Features' },
  { name: 'Fun', path: 'Fun', category: 'Features' },
  { name: 'Tools', path: 'Tools', category: 'Developer Tools' },
];

export default async function GuildDashboardLayout({ children, params }) {
  const { guildId } = await params;

  let guild = null;
  try {
    guild = await getGuildInfo(guildId);
  } catch (error) {
    console.error('Failed to load guild info for sidebar:', error);
  }

  // Group sections by category
  const categories = SECTIONS.reduce((acc, curr) => {
    if (!acc[curr.category]) acc[curr.category] = [];
    acc[curr.category].push(curr);
    return acc;
  }, {});

  return (
    <div className="flex h-screen bg-[#2c2f33] text-white overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-[#23272a] flex flex-col border-r border-gray-800">
        {/* Guild Header */}
        <div className="p-6 border-b border-gray-800 flex items-center space-x-3">
          {guild?.icon ? (
            <img
              src={`https://cdn.discordapp.com/icons/${guildId}/${guild.icon}.png`}
              alt={guild.name}
              className="w-10 h-10 rounded-lg object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center font-bold text-sm text-indigo-400">
              {guild?.name ? guild.name.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase() : 'G'}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-sm truncate text-gray-200">{guild?.name || 'FoxCraft'}</h2>
            <Link href="/dashboard" className="text-xs text-[#5865F2] hover:underline">
              ← Switch Server
            </Link>
          </div>
        </div>

        {/* Navigation Categories */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-6">
          {Object.entries(categories).map(([category, items]) => (
            <div key={category} className="space-y-1.5">
              <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-3 mb-2">
                {category}
              </h4>
              <ul className="space-y-1">
                {items.map((item) => (
                  <li key={item.path}>
                    <Link
                      href={`/dashboard/${guildId}/${item.path}`}
                      className="flex items-center px-3 py-2 text-sm font-semibold rounded-md text-gray-300 hover:text-white hover:bg-gray-700/50 transition-colors"
                    >
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main Content Pane */}
      <main className="flex-1 overflow-y-auto bg-[#2c2f33]">
        {children}
      </main>
    </div>
  );
}
