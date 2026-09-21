'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const DISCORD_AUTH_URL = `https://discord.com/api/oauth2/authorize?client_id=${process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#2c2f33]">
      <div className="bg-[#23272a] p-8 rounded-lg shadow-xl w-full max-w-md text-center">
        <h1 className="text-3xl font-bold text-white mb-6">FoxCraft idarəetməsi</h1>
        <p className="text-gray-400 mb-8">Manage your server settings with ease.</p>
        
        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-500 p-3 rounded mb-6 text-sm">
            {error === 'oauth_failed' ? 'Discord login failed. Please try again.' : 'An error occurred during login.'}
          </div>
        )}

        <a
          href={DISCORD_AUTH_URL}
          className="inline-flex items-center justify-center w-full px-6 py-3 bg-[#5865F2] hover:bg-[#4752C4] text-white font-semibold rounded-md transition-colors duration-200"
        >
          Login with Discord
        </a>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#2c2f33] text-white">Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
