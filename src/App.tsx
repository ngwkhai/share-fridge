import React, { useState, useEffect, useRef } from 'react';
import { api } from './services/api';
import { CreateFoodDto, ParsedFoodItem, RecipeSuggestion, GoogleIdentity } from './types';
import { Header } from './components/Header';
import { PulseStrip } from './components/PulseStrip';
import { FilterBar, FilterCategory } from './components/FilterBar';
import { FoodCard } from './components/FoodCard';
import { QuickAddModal } from './components/QuickAddModal';
import { VoiceInputModal } from './components/VoiceInputModal';
import { RecipeModal } from './components/RecipeModal';
import { ShoppingListTab } from './components/ShoppingListTab';
import { BottomNav, TabType } from './components/BottomNav';
import { NotificationModal } from './components/NotificationModal';
import { SettingsModal } from './components/SettingsModal';
import { GoogleAuthButton } from './components/GoogleAuthButton';
import { signOutGoogle } from './services/googleIdentity';
import { useRoomSync } from './hooks/useRoomSync';
import { PlusCircle, Search, Lock, User, ArrowRight } from 'lucide-react';

export default function App() {
  const sync = useRoomSync();
  const initialCache = sync.session;
  const roomCode = initialCache?.code || '';
  const room = sync.snapshot?.room || (initialCache?.room ? { ...initialCache.room, active_food_count: 0, urgent_food_count: 0 } : null);
  const foods = sync.snapshot?.foods || [];
  const consumedFoods = sync.snapshot?.consumed || [];
  const shoppingItems = sync.snapshot?.shopping || [];
  const [currentPasscode, setCurrentPasscode] = useState('');
  const [currentNickname, setCurrentNickname] = useState('Bạn cùng phòng');
  const [googleEmail, setGoogleEmail] = useState<string | undefined>();
  const [userAvatar, setUserAvatar] = useState<string | undefined>();
  useEffect(() => {
    setCurrentPasscode(initialCache?.passcode || '');
    setCurrentNickname(initialCache?.nickname || 'Bạn cùng phòng');
    setGoogleEmail(initialCache?.google_profile?.email);
    setUserAvatar(initialCache?.google_profile?.picture);
  }, [initialCache]);

  const [activeFilter, setActiveFilter] = useState<FilterCategory>('ALL');
  const [currentTab, setCurrentTab] = useState<TabType>('FRIDGE');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const [isRecipeOpen, setIsRecipeOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [voiceDraftData, setVoiceDraftData] = useState<Partial<CreateFoodDto> | undefined>(undefined);

  // Setup / Join Room State
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [inputPasscode, setInputPasscode] = useState('');
  const [inputNickname, setInputNickname] = useState('');
  const [googleIdentity, setGoogleIdentity] = useState<GoogleIdentity | null>(null);
  const [googleAttempt, setGoogleAttempt] = useState(0);
  const authAttempt = useRef(0);
  const [newRoomName, setNewRoomName] = useState('Phòng 302');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const previousSession = useRef(initialCache?.token);
  useEffect(() => {
    const token = initialCache?.token;
    if (token || (previousSession.current && !token)) {
      authAttempt.current++;
      setGoogleIdentity(null);
      setGoogleAttempt(value => value + 1);
      if (!token) { signOutGoogle(); setInputNickname(''); }
    }
    previousSession.current = token;
  }, [initialCache?.token]);


  useEffect(() => {
    setIsQuickAddOpen(false); setIsVoiceOpen(false); setIsRecipeOpen(false); setIsNotifOpen(false); setIsSettingsOpen(false); setVoiceDraftData(undefined); setError('');
  }, [initialCache?.token]);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const pCode = inputPasscode.trim();
      if (!/^\d{4,6}$/.test(pCode)) throw new Error('Nhập mật khẩu phòng gồm 4 đến 6 chữ số.');
      if (googleIdentity && Date.parse(googleIdentity.expires_at) <= Date.now()) throw new Error('Xác minh Google đã hết hạn. Hãy chọn lại tài khoản Google.');
      const rName = newRoomName.trim() || 'Phòng mới';
      const nick = inputNickname.trim() || 'Bạn cùng phòng';

      await api.createRoomWithPasscode(undefined, rName, pCode, nick, googleIdentity?.identity_token);
    } catch (err: any) {
      setError(err.message || 'Lỗi tạo phòng');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim()) return;
    setLoading(true);
    setError('');
    try {
      const pCode = inputPasscode.trim();
      if (!/^\d{4,6}$/.test(pCode)) throw new Error('Nhập mật khẩu phòng gồm 4 đến 6 chữ số.');
      if (googleIdentity && Date.parse(googleIdentity.expires_at) <= Date.now()) throw new Error('Xác minh Google đã hết hạn. Hãy chọn lại tài khoản Google.');
      const nick = inputNickname.trim() || 'Bạn cùng phòng';

      await api.joinRoomWithPasscode(inputCode.trim(), pCode, nick, googleIdentity?.identity_token);
    } catch (err: any) {
      setError(err.message || 'Không thể tham gia phòng');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    authAttempt.current++; setGoogleIdentity(null); setGoogleAttempt(value => value + 1); signOutGoogle();
    sync.logout();
    setIsQuickAddOpen(false); setIsVoiceOpen(false); setIsRecipeOpen(false);
    setIsNotifOpen(false); setIsSettingsOpen(false); setVoiceDraftData(undefined);
    setInputPasscode(''); setError('');
  };

  const googleGeneration = authAttempt.current;
  const handleGoogleSuccess = (identity: GoogleIdentity) => {
    if (authAttempt.current !== googleGeneration || api.sessionCache.get()) return;
    setGoogleIdentity(identity);
    setInputNickname(identity.profile.name);
  };

  const handleUpdateNickname = (newNick: string) => {
    setCurrentNickname(newNick);
    const cache = api.sessionCache.get();
    if (cache) {
      api.sessionCache.save({ ...cache, nickname: newNick });
    }
  };

  // Data changes are accepted only after server success and a guarded refresh.
  const runMutation = async <T,>(operation: () => Promise<T>): Promise<T> => {
    setError('');
    try { return await sync.mutate(operation); }
    catch (err) {
      if (!(err instanceof Error && 'code' in err && err.code === 'SESSION_CHANGED')) setError(err instanceof Error ? err.message : 'Không thể lưu thay đổi.');
      throw err;
    }
  };
  const handleAddFood = async (dto: CreateFoodDto) => {
    await runMutation(() => api.addFood({ ...dto, created_by: currentNickname }));
    setVoiceDraftData(undefined);
  };
  const handleConsumeFood = async (id: string) => { await runMutation(() => api.consumeFood(id, undefined, true)); };
  const handleDeleteFood = async (id: string) => { await runMutation(() => api.deleteFood(id)); };

  const handleVoiceParsed = (parsed: ParsedFoodItem) => {
    if (!initialCache || api.sessionCache.get()?.token !== initialCache.token) return;
    setVoiceDraftData({
      name: parsed.name,
      quantity: parsed.quantity,
      compartment: parsed.compartment as any,
      container_tag: parsed.container_tag,
      shelf_life_days: parsed.shelf_life_days,
      created_by: currentNickname
    });
    setIsQuickAddOpen(true);
  };

  const handleCookRecipe = async (recipe: RecipeSuggestion, idempotencyKey: string) => {
    await runMutation(() => api.consumeBatch(recipe.food_ids, idempotencyKey, false));
  };
  const handleAddShoppingItem = async (name: string, quantity?: string) => {
    await runMutation(() => api.addShoppingItem({ room_code: roomCode, name, quantity }));
  };
  const handleToggleShoppingItem = async (id: string, isBought: boolean) => {
    try { await runMutation(() => api.toggleShoppingItem(id, isBought)); } catch { /* Error remains visible above the room. */ }
  };
  const handleDeleteShoppingItem = async (id: string) => {
    try { await runMutation(() => api.deleteShoppingItem(id)); } catch { /* Error remains visible above the room. */ }
  };

  // Filter & Search Logic
  const filteredFoods = foods.filter(food => {
    if (searchQuery.trim() && !food.name.toLowerCase().includes(searchQuery.toLowerCase().trim())) {
      return false;
    }
    switch (activeFilter) {
      case 'URGENT':
        return food.status === 'COOK_SOON' || food.status === 'EXPIRED';
      case 'FREEZER':
        return food.compartment === 'FREEZER';
      case 'FRIDGE':
        return food.compartment === 'FRIDGE_TOP' || food.compartment === 'FRIDGE_BOTTOM';
      case 'CRISPER':
        return food.compartment === 'CRISPER';
      case 'DOOR':
        return food.compartment === 'DOOR';
      default:
        return true;
    }
  });

  return (
    <div className="min-h-screen flex flex-col max-w-md mx-auto shadow-2xl border-x border-slate-200/60 pb-24 relative overflow-hidden">
      {/* Header */}
      {room && (
        <Header
          roomCode={room.code}
          roomName={room.name}
          nickname={currentNickname}
          userAvatar={userAvatar}
          onRefresh={() => { void sync.refresh(); }}
          onChangeRoom={handleLogout}
          onOpenNotifications={() => setIsNotifOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          loading={sync.refreshing || sync.pending > 0}
          connectionStatus={sync.status}
        />
      )}

      {/* Main Body */}
      <main className="flex-1 p-4 space-y-4">
        {(sync.error || (room && error)) && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error || sync.error}</p>}
        {sync.snapshot && sync.stale && <p role="status" className="text-xs text-slate-600">Dữ liệu có thể chưa cập nhật. Thay đổi chỉ được lưu khi có kết nối.</p>}
        {!initialCache ? (
          /* Sleek Minimalist Auth Screen with 3D Logo */
          <div className="glass-card rounded-3xl p-6 shadow-xl space-y-5 my-auto text-center">
            <div className="flex flex-col items-center gap-2.5">
              <div className="relative">
                <img
                  src={googleIdentity?.profile.picture || '/logo.jpg'}
                  alt="ShareFridge Logo"
                  className="w-20 h-20 rounded-3xl object-cover ring-4 ring-fresh-400/50 shadow-xl"
                />
                <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-fresh-500 border-2 border-white rounded-full"></span>
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">ShareFridge</h2>
                <p className="text-xs font-semibold text-slate-500">Tủ Lạnh Phòng Trọ</p>
              </div>
            </div>

            {/* Google Sign-In One-Click */}
            <div className="space-y-3">
              <GoogleAuthButton key={`${googleAttempt}-${isCreateMode}`} onSuccess={handleGoogleSuccess} />
              {googleIdentity && <div className="text-xs text-slate-700"><p>{googleIdentity.profile.name} · {googleIdentity.profile.email}</p><button type="button" onClick={() => { authAttempt.current++; setGoogleIdentity(null); setGoogleAttempt(value => value + 1); setInputNickname(''); }} className="min-h-11 px-3 text-emerald-700">Bỏ tài khoản Google</button></div>}
              
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200"></div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">thông tin phòng</span>
                <div className="flex-1 h-px bg-slate-200"></div>
              </div>
            </div>

            {!isCreateMode ? (
              <form onSubmit={handleJoinRoom} className="space-y-3.5 text-left">
                <div>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="Mã PIN 6 số (VD: 123456)"
                    value={inputCode}
                    onChange={(e) => setInputCode(e.target.value)}
                    className="w-full text-center text-lg tracking-widest font-mono font-bold py-3 px-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-fresh-500 focus:outline-none glass-input"
                    autoFocus
                  />
                </div>

                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="password"
                    placeholder="Mật khẩu phòng (Passcode)"
                    value={inputPasscode}
                    onChange={(e) => setInputPasscode(e.target.value)}
                    className="w-full pl-10 pr-3 py-3 border border-slate-200 rounded-2xl text-sm font-mono focus:ring-2 focus:ring-fresh-500 focus:outline-none glass-input"
                  />
                </div>

                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    placeholder="Tên của bạn"
                    value={inputNickname}
                    onChange={(e) => setInputNickname(e.target.value)}
                    className="w-full pl-10 pr-3 py-3 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-fresh-500 focus:outline-none glass-input"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !inputCode.trim()}
                  className="w-full py-3.5 bg-gradient-to-r from-fresh-600 to-emerald-500 hover:from-fresh-500 hover:to-emerald-400 disabled:opacity-50 text-white font-extrabold rounded-2xl text-sm transition-all shadow-lg flex items-center justify-center gap-1.5 active:scale-98"
                >
                  <span>{loading ? 'Đang kết nối...' : 'Vào tủ lạnh'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <form onSubmit={handleCreateRoom} className="space-y-3.5 text-left">
                <input
                  type="text"
                  placeholder="Tên phòng (VD: Phòng 302)"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  className="w-full py-3 px-4 border border-slate-200 rounded-2xl text-sm font-semibold focus:ring-2 focus:ring-fresh-500 focus:outline-none glass-input"
                  required
                />

                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="password"
                    placeholder="Mật khẩu bảo vệ (Passcode 4 số)"
                    value={inputPasscode}
                    onChange={(e) => setInputPasscode(e.target.value)}
                    className="w-full pl-10 pr-3 py-3 border border-slate-200 rounded-2xl text-sm font-mono focus:ring-2 focus:ring-fresh-500 focus:outline-none glass-input"
                    required
                  />
                </div>

                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    placeholder="Tên của bạn"
                    value={inputNickname}
                    onChange={(e) => setInputNickname(e.target.value)}
                    className="w-full pl-10 pr-3 py-3 border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-fresh-500 focus:outline-none glass-input"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-gradient-to-r from-fresh-600 to-emerald-500 hover:from-fresh-500 hover:to-emerald-400 disabled:opacity-50 text-white font-extrabold rounded-2xl text-sm transition-all shadow-lg active:scale-98"
                >
                  {loading ? 'Đang tạo...' : 'Tạo phòng mới'}
                </button>
              </form>
            )}

            <button
              type="button"
              onClick={() => { authAttempt.current++; setGoogleIdentity(null); setIsCreateMode(!isCreateMode); setError(''); }}
              className="w-full py-2 text-slate-600 hover:text-slate-900 font-bold text-xs flex items-center justify-center gap-1 transition-colors"
            >
              <span>{isCreateMode ? 'Đã có mã? Vào phòng' : 'Tạo phòng mới cho 2 người'}</span>
            </button>

            {error && (
              <div className="p-3 bg-danger-500/10 text-danger-700 text-xs rounded-2xl border border-danger-200 font-semibold">
                {error}
              </div>
            )}
          </div>
        ) : !sync.snapshot ? (
          <section aria-labelledby="room-loading-title" aria-busy={sync.refreshing} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
            <div role="status" className="space-y-1">
              <h2 id="room-loading-title" className="font-semibold text-slate-900">
                {sync.refreshing || (!sync.error && sync.status !== 'offline') ? 'Đang tải dữ liệu phòng' : 'Chưa tải được dữ liệu phòng'}
              </h2>
              <p className="text-sm text-slate-600">
                {sync.status === 'offline' ? 'Đang ngoại tuyến. Kết nối mạng để xem thực phẩm và danh sách đi chợ.' : 'Thực phẩm và danh sách đi chợ sẽ hiện sau khi tải xong.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => { void sync.refresh(); }} disabled={sync.refreshing || sync.status === 'offline'} className="min-h-11 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500">
                {sync.refreshing ? 'Đang tải...' : 'Thử tải lại'}
              </button>
              <button type="button" onClick={handleLogout} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500">Vào phòng khác</button>
            </div>
          </section>
        ) : (
          /* Active Tabs */
          <>
            {currentTab === 'FRIDGE' && (
              <div className="space-y-4">
                {/* Pulse Strip */}
                <PulseStrip
                  foods={foods}
                  shoppingCount={shoppingItems.filter(i => !i.is_bought).length}
                  onFilterClick={(cat) => {
                    if (cat === 'SHOPPING') setCurrentTab('SHOPPING');
                    else setActiveFilter(cat as FilterCategory);
                  }}
                />

                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Tìm nhanh trong tủ..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-2xl text-xs font-semibold focus:ring-2 focus:ring-fresh-500 focus:outline-none glass-input shadow-2xs"
                  />
                </div>

                {/* Filter Bar */}
                <FilterBar
                  activeFilter={activeFilter}
                  onSelectFilter={setActiveFilter}
                />

                {/* Food List */}
                <div className="space-y-2.5">
                  {filteredFoods.length === 0 ? (
                    <div className="py-14 glass-card rounded-3xl text-center space-y-3 p-6">
                      <div className="w-14 h-14 bg-fresh-500/10 text-fresh-600 rounded-3xl flex items-center justify-center mx-auto text-3xl">
                        🥗
                      </div>
                      <div className="space-y-0.5">
                        <h4 className="font-extrabold text-slate-800 text-sm">Chưa có món nào ở mục này</h4>
                      </div>
                      <button
                        onClick={() => setIsQuickAddOpen(true)}
                        className="px-4 py-2.5 bg-gradient-to-r from-fresh-600 to-emerald-500 text-white font-bold rounded-xl text-xs inline-flex items-center gap-1.5 shadow-md active:scale-95"
                      >
                        <PlusCircle className="w-4 h-4" />
                        <span>Thêm món ngay</span>
                      </button>
                    </div>
                  ) : (
                    filteredFoods.map((food) => (
                      <FoodCard
                        key={food.id}
                        food={food}
                        onConsume={id => { void handleConsumeFood(id).catch(() => {}); }}
                        onDelete={id => { void handleDeleteFood(id).catch(() => {}); }}
                      />
                    ))
                  )}
                </div>
              </div>
            )}

            {currentTab === 'SHOPPING' && (
              <ShoppingListTab
                items={shoppingItems}
                onAddItem={handleAddShoppingItem}
                onToggleItem={handleToggleShoppingItem}
                onDeleteItem={handleDeleteShoppingItem}
              />
            )}

            {currentTab === 'HISTORY' && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
                  Đã dùng ({consumedFoods.length})
                </h3>
                {consumedFoods.length === 0 ? (
                  <div className="py-12 glass-card rounded-2xl text-center text-xs text-slate-400 font-semibold p-4">
                    Chưa có món nào đã nấu
                  </div>
                ) : (
                  <div className="space-y-2 opacity-80">
                    {consumedFoods.map((food) => (
                      <div key={food.id} className="glass-card p-3 rounded-2xl flex items-center justify-between">
                        <div>
                          <div className="font-bold text-sm text-slate-800 line-through">{food.name}</div>
                          <div className="text-[11px] text-slate-400 font-medium">{food.compartment}</div>
                        </div>
                        <button
                          onClick={() => { void handleDeleteFood(food.id).catch(() => {}); }}
                          className="text-xs text-slate-400 hover:text-danger-600 font-semibold"
                        >
                          Xóa
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Bottom Sticky Floating White Dock */}
      {sync.snapshot && (
        <BottomNav
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          onOpenQuickAdd={() => setIsQuickAddOpen(true)}
          onOpenVoice={() => setIsVoiceOpen(true)}
          onOpenRecipe={() => setIsRecipeOpen(true)}
        />
      )}

      {/* Modals */}
      <QuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => { setIsQuickAddOpen(false); setVoiceDraftData(undefined); }}
        onAdd={handleAddFood}
        roomCode={roomCode}
        nickname={currentNickname}
        initialData={voiceDraftData}
      />

      <VoiceInputModal
        isOpen={isVoiceOpen}
        onClose={() => setIsVoiceOpen(false)}
        onParsed={handleVoiceParsed}
      />

      <RecipeModal
        isOpen={isRecipeOpen}
        onClose={() => setIsRecipeOpen(false)}
        roomCode={roomCode}
        onCookRecipe={handleCookRecipe}
      />

      <NotificationModal
        isOpen={isNotifOpen}
        onClose={() => setIsNotifOpen(false)}
        roomCode={roomCode}
      />

      {room && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          roomCode={room.code}
          roomName={room.name}
          passcode={currentPasscode}
          nickname={currentNickname}
          googleEmail={googleEmail}
          userAvatar={userAvatar}
          onUpdateNickname={handleUpdateNickname}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}
