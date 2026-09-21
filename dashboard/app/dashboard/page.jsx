import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession } from '@/lib/auth';
import { getManageableGuilds } from '@/lib/permissions';
import RefreshGuildsButton from '@/components/RefreshGuildsButton';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('session')?.value;

  if (!sessionToken) {
    redirect('/login');
  }

  const user = await verifySession(sessionToken);
  if (!user) {
    redirect('/login');
  }

  const guilds = getManageableGuilds(user);

  return (
    <div className="min-h-screen bg-[#2c2f33] text-white p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight">Select a Server</h1>
            <p className="text-gray-400 mt-2">İdarə etdiyin serveri seç və FoxCraft ayarlarını dəyiş</p>
          </div>
          <div className="flex items-center space-x-4 bg-[#23272a] px-4 py-2 rounded-lg">
            {user.avatar ? (
              <img
                src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
                alt={user.username}
                className="w-10 h-10 rounded-full"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white">
                {user.username[0]?.toUpperCase()}
              </div>
            )}
            <span className="font-semibold text-gray-200">{user.username}</span>
            <RefreshGuildsButton />
          </div>
        </header>

        {guilds.length === 0 ? (
          <div className="bg-[#23272a] border border-gray-700 rounded-lg p-12 text-center">
            <h2 className="text-xl font-bold text-gray-300 mb-2">No Servers Found</h2>
            <p className="text-gray-400">You do not seem to have &apos;Manage Server&apos; permission in any Discord servers.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {guilds.map((guild) => (
              <a
                key={guild.id}
                href={`/dashboard/${guild.id}/Overview`}
                className="group block bg-[#23272a] hover:bg-[#2c2f33] border border-transparent hover:border-[#5865F2] rounded-xl p-6 transition-all duration-200 shadow-md hover:shadow-lg"
              >
                <div className="flex items-center space-x-4">
                  {guild.icon ? (
                    <img
                      src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`}
                      alt={guild.name}
                      className="w-16 h-16 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-gray-700 flex items-center justify-center font-bold text-xl text-indigo-400 group-hover:bg-[#5865F2] group-hover:text-white transition-colors duration-200">
                      {guild.name.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold truncate group-hover:text-white text-gray-200">
                      {guild.name}
                    </h3>
                    <p className="text-xs text-gray-400 mt-1 truncate">ID: {guild.id}</p>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
