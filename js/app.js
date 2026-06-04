const MOCK_DATA = [
    {
        id: 1,
        author: "simulizi_master",
        caption: "Part 1: The lost city of gold. 🏰 #storytime #simulizi #mystery",
        likes: "1.2M",
        comments: "45K",
        shares: "10K",
        price: 0,
        isPremium: false,
        videoUrl: "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
        music: "Original Sound - simulizi_master"
    },
    {
        id: 2,
        author: "sauti_tamu",
        caption: "Exclusive: Mapenzi ya siri... 🤫 #mapenzi #premium",
        likes: "890K",
        comments: "12K",
        shares: "5K",
        price: 100, // TZS
        isPremium: true,
        videoUrl: "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
        music: "Romantic Beats - sauti_tamu"
    },
    {
        id: 3,
        author: "hadithi_zetu",
        caption: "Siri Ya Mlima Kilimanjaro - Ep 5 🏔️ #adventure",
        likes: "2.5M",
        comments: "80K",
        shares: "30K",
        price: 200,
        isPremium: true,
        videoUrl: "http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
        music: "Epic Journey - hadithi_zetu"
    }
];

const SUPABASE_URL = 'https://okfecjwpxuqbkcfbtfcw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rZmVjandweHVxYmtjZmJ0ZmN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MTY5ODQsImV4cCI6MjA5NjA5Mjk4NH0.fcsrJkS3MVwDpmck3_9cZ8twtyzdfrKb4rqM-S7jr6E';
let supabaseClient;
try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
    document.body.innerHTML = `<div style="padding:20px; color:red; background:white; position:fixed; z-index:9999; top:0; left:0; right:0;"><h3>Global Init Error (Supabase Blocked?)</h3><pre>${e.message}</pre><pre>${e.stack}</pre></div>` + document.body.innerHTML;
}

class TikTokClone {
    constructor() {
        this.state = {
            isAuthenticated: false,
            user: null,
            cameraStream: null,
            signupData: {
                email: '',
                password: '',
                username: ''
            },
            feedType: 'foryou'
        };
        this.authMode = 'signup';
        this.mediaRecorder = null;
        this.recordedBlob = null;
        
        // Listen for the first user interaction to unlock audio
        this.audioUnlocked = false;
        const unlockAudio = () => {
            if (this.audioUnlocked) return;
            this.audioUnlocked = true;
            // Play and unmute the currently visible video
            document.querySelectorAll('.media-video').forEach(v => {
                v.muted = false; // Unmute it so it has sound
                const rect = v.getBoundingClientRect();
                if (rect.top >= 0 && rect.bottom <= window.innerHeight) {
                    v.play().catch(() => {});
                }
            });
            document.removeEventListener('click', unlockAudio);
            document.removeEventListener('touchstart', unlockAudio);
        };
        document.addEventListener('click', unlockAudio);
        document.addEventListener('touchstart', unlockAudio);

        this.init();
    }

    async init() {
        try {
            // Splash screen timeout
            setTimeout(() => {
                const splash = document.getElementById('splash-screen');
                if (splash) {
                    splash.style.opacity = '0';
                    setTimeout(() => splash.remove(), 500);
                }
            }, 1500);
            // Check active session on load
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session) {
                this.state.isAuthenticated = true;
                this.state.user = session.user;
                await this.ensureProfileExists();
                this.updateProfileUI();
            } else {
                // Force login to see content
                this.showAuthModal();
                // Hide the close button so they MUST log in
                const closeBtn = document.querySelector('.auth-close');
                if(closeBtn) closeBtn.style.display = 'none';
            }

            // Listen for auth changes
            supabaseClient.auth.onAuthStateChange(async (event, session) => {
                if (event === 'SIGNED_IN') {
                    this.state.isAuthenticated = true;
                    this.state.user = session.user;
                    await this.ensureProfileExists();
                    this.updateProfileUI();
                    const closeBtn = document.querySelector('.auth-close');
                    if(closeBtn) closeBtn.style.display = 'block'; // Restore close button
                    this.closeAuthModal();
                    this.switchTab('profile-view');
                } else if (event === 'SIGNED_OUT') {
                    this.state.isAuthenticated = false;
                    this.state.user = null;
                    this.switchTab('home-view');
                    // Force modal again
                    this.showAuthModal();
                    const closeBtn = document.querySelector('.auth-close');
                    if(closeBtn) closeBtn.style.display = 'none';
                }
            });

            this.setupIntersectionObserver(); // MUST be first so feedObserver exists when renderFeed appends cards
            this.renderFeed();
            this.setupInboxInteractions();
            this.setupProfileTabs();
            this.updateInboxUI();
            this.setupRealtimeSync();
        } catch (err) {
            document.body.innerHTML = `<div style="padding:20px; color:red; background:white; position:fixed; z-index:9999; top:0; left:0; right:0;"><h3>App Error</h3><pre>${err.message}</pre><pre>${err.stack}</pre></div>` + document.body.innerHTML;
        }
    }

    setupRealtimeSync() {
        // Listen to likes table to update like counts instantly across all devices
        supabaseClient
            .channel('public:likes')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'likes' }, payload => {
                this.updateRealtimeCount(payload.new.video_id, 1, 'likes');
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'likes' }, payload => {
                this.updateRealtimeCount(payload.old.video_id, -1, 'likes');
            })
            .subscribe();
    }

    updateRealtimeCount(videoId, delta, type) {
        // Find the video element in the DOM
        const mediaItems = document.querySelectorAll('.media-item');
        mediaItems.forEach(item => {
            if (item.dataset.videoId === videoId) {
                if (type === 'likes') {
                    const countEl = item.querySelector('.likes-count');
                    if (countEl) {
                        let currentCount = parseInt(countEl.textContent || 0);
                        // Prevent optimistic UI from double counting
                        // This simple implementation relies on the fact that optimistic UI updates instantly,
                        // so we only update if it seems we missed it. For a robust app, we'd debounce or check sender.
                        countEl.textContent = Math.max(0, currentCount + delta);
                    }
                }
            }
        });
    }

    async ensureProfileExists() {
        if (!this.state.user) return null;
        const { data, error: selectError } = await supabaseClient.from('profiles').select('id, avatar_url').eq('id', this.state.user.id).single();
        if (!data) {
            const handle = this.state.user.user_metadata?.username || this.state.user.email.split('@')[0];
            const avatar = this.state.user.user_metadata?.avatar_url || '';
            const { error: insertError } = await supabaseClient.from('profiles').insert({
                id: this.state.user.id,
                username: handle,
                avatar_url: avatar
            });
            if (insertError) {
                console.error("Profile insert failed:", insertError);
                return insertError;
            }
        } else if (!data.avatar_url && this.state.user.user_metadata?.avatar_url) {
            // Update existing profile with missing avatar
            await supabaseClient.from('profiles').update({ avatar_url: this.state.user.user_metadata.avatar_url }).eq('id', this.state.user.id);
        }
        return null;
    }

    // --- NAVIGATION & AUTH ---
    handleNavClick(viewId) {
        const restrictedViews = ['upload-view', 'inbox-view', 'profile-view'];
        if (!this.state.isAuthenticated && restrictedViews.includes(viewId)) {
            this.showAuthModal();
            return;
        }
        
        if (viewId === 'upload-view') {
            document.getElementById('gallery-file-input').click();
            return;
        }
        
        this.switchTab(viewId);
    }

    showAuthModal() {
        document.getElementById('auth-overlay').classList.remove('hidden');
        
        this.authMode = 'signup';
        const banner = document.getElementById('auth-toggle-banner');
        if(banner) banner.innerHTML = 'Already have an account? <span class="login-link" onclick="app.toggleAuthMode()">Log in</span>';
        
        // Hide login view
        const loginView = document.getElementById('auth-wizard-login');
        if(loginView) loginView.classList.add('hidden');

        // Go straight to step 1
        this.goToWizardStep(1);

        // Timeout ensures CSS transition works
        setTimeout(() => {
            document.getElementById('auth-modal').classList.remove('hidden');
        }, 10);
    }

    closeAuthModal() {
        if (!this.state.isAuthenticated) {
            // If they are not logged in, they cannot close the modal (forced login)
            return;
        }

        document.getElementById('auth-modal').classList.add('hidden');
        
        // Wait for slide down transition before hiding overlay
        setTimeout(() => {
            document.getElementById('auth-overlay').classList.add('hidden');
        }, 300);
    }

    getWizardId(step) {
        return {1: 'birthday', 2: 'email', 3: 'password', 4: 'username'}[step];
    }

    toggleAuthMode() {
        const banner = document.getElementById('auth-toggle-banner');
        const loginView = document.getElementById('auth-wizard-login');
        
        if (this.authMode === 'signup') {
            this.authMode = 'login';
            // Hide all signup wizard steps
            [1,2,3,4].forEach(i => {
                const el = document.getElementById(`auth-wizard-${this.getWizardId(i)}`);
                if(el) el.classList.add('hidden');
            });
            if(loginView) loginView.classList.remove('hidden');
            if(banner) banner.innerHTML = 'Don\'t have an account? <span class="login-link" onclick="app.toggleAuthMode()">Sign up</span>';
        } else {
            this.authMode = 'signup';
            if(loginView) loginView.classList.add('hidden');
            this.goToWizardStep(1);
            if(banner) banner.innerHTML = 'Already have an account? <span class="login-link" onclick="app.toggleAuthMode()">Log in</span>';
        }
    }

    async submitLogin() {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorDiv = document.getElementById('login-error');
        const btn = document.getElementById('btn-login');

        if (!email || !password) {
            errorDiv.textContent = 'Please enter both email and password';
            errorDiv.classList.remove('hidden');
            return;
        }

        errorDiv.classList.add('hidden');
        btn.disabled = true;
        btn.textContent = "Logging in...";

        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            errorDiv.textContent = error.message;
            errorDiv.classList.remove('hidden');
            btn.disabled = false;
            btn.textContent = "Log in";
        } else {
            btn.textContent = "Success!";
            // onAuthStateChange handles the rest
        }
    }

    togglePasswordVisibility(inputId, iconElement) {
        const input = document.getElementById(inputId);
        if (!input) return;
        if (input.type === 'password') {
            input.type = 'text';
            iconElement.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
        } else {
            input.type = 'password';
            iconElement.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
        }
    }


    goToWizardStep(step) {
        // Hide all steps
        [1,2,3,4].forEach(i => {
            const el = document.getElementById(`auth-wizard-${this.getWizardId(i)}`);
            if(el) el.classList.add('hidden');
        });
        
        // Show target step
        document.getElementById(`auth-wizard-${this.getWizardId(step)}`).classList.remove('hidden');
    }

    nextWizardStep(currentStep) {
        // Validate current step
        const inputId = `wizard-${this.getWizardId(currentStep)}`;
        const val = document.getElementById(inputId).value;
        
        if (!val) {
            alert(`Please enter your ${this.getWizardId(currentStep)}`);
            return;
        }

        // Save data
        this.state.signupData[this.getWizardId(currentStep)] = val;
        
        // Go to next
        this.goToWizardStep(currentStep + 1);
    }

    prevWizardStep(targetStep) {
        this.goToWizardStep(targetStep);
    }

    async submitWizard() {
        const usernameInput = document.getElementById('wizard-username').value;
        const roleInput = document.getElementById('wizard-role').value;
        if (!usernameInput) {
            alert('Please enter a username');
            return;
        }
        this.state.signupData.username = usernameInput;
        this.state.signupData.role = roleInput;
        
        const errorDiv = document.getElementById('auth-error');
        errorDiv.classList.add('hidden');
        const btn = document.getElementById('btn-step-4');
        btn.disabled = true;
        btn.textContent = "Checking...";

        const email = this.state.signupData.email;
        const password = this.state.signupData.password;

        // Try sign in first (if user exists)
        const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (signInError) {
            if (signInError.message.includes('Invalid login credentials')) {
                // It's a new user, let's sign up
                
                // FIRST: Check if username is already taken
                const { data: existingProfiles, error: profileError } = await supabaseClient
                    .from('profiles')
                    .select('username')
                    .eq('username', this.state.signupData.username);

                // If the table exists and returned a match, it's taken
                if (existingProfiles && existingProfiles.length > 0) {
                    errorDiv.textContent = "This username is already taken. Please choose another.";
                    errorDiv.classList.remove('hidden');
                    btn.disabled = false;
                    btn.textContent = "Sign up";
                    return;
                }

                btn.textContent = "Loading...";

                const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            username: this.state.signupData.username,
                            birthday: this.state.signupData.birthday,
                            role: this.state.signupData.role
                        }
                    }
                });
                
                if (signUpError) {
                    errorDiv.textContent = signUpError.message;
                    errorDiv.classList.remove('hidden');
                    btn.disabled = false;
                    btn.textContent = "Sign up";
                } else {
                    // Success, handled by onAuthStateChange
                    btn.textContent = "Success!";
                }
            } else {
                errorDiv.textContent = signInError.message;
                errorDiv.classList.remove('hidden');
                btn.disabled = false;
                btn.textContent = "Sign up";
            }
        }
    }



    async logout() {
        await supabaseClient.auth.signOut();
    }

    async updateProfileUI() {
        if (this.state.user) {
            // Check if verified or admin
            const isAdmin = this.state.user.email === 'meshackurassa2@gmail.com';
            
            // Fetch real verification status from profiles table
            const { data: profile } = await supabaseClient.from('profiles').select('is_verified').eq('id', this.state.user.id).single();
            const isVerified = isAdmin || (profile && profile.is_verified === true);
            
            // Show Admin button if admin
            const adminBtn = document.getElementById('btn-admin-dashboard');
            if (adminBtn) adminBtn.style.display = isAdmin ? 'block' : 'none';
            const uploadBtn = document.getElementById('nav-upload-btn');
            if (uploadBtn) {
                // Only show upload button if the user is a verified creator (or admin)
                uploadBtn.style.display = isVerified ? 'flex' : 'none';
            }
            
            const profileTabs = document.querySelector('.profile-tabs-2024');
            const profileGrid = document.querySelector('.profile-grid');
            if (profileTabs) profileTabs.style.display = isVerified ? 'flex' : 'none';
            if (profileGrid) profileGrid.style.display = isVerified ? 'grid' : 'none';
            
            const followersStat = document.getElementById('stat-followers');
            const likesStat = document.getElementById('stat-likes');
            const followingStat = document.getElementById('stat-following');
            
            if (followersStat) followersStat.style.display = isVerified ? 'flex' : 'none';
            if (likesStat) likesStat.style.display = isVerified ? 'flex' : 'none';
            if (followingStat) followingStat.style.display = isVerified ? 'none' : 'flex';


            let displayHandle = this.state.user.email;
            if (this.state.user.user_metadata && this.state.user.user_metadata.username) {
                displayHandle = '@' + this.state.user.user_metadata.username;
            }
            document.querySelector('.profile-handle-text').textContent = displayHandle;

            // Show bio if available
            const bio = this.state.user.user_metadata?.bio || '';
            let bioEl = document.getElementById('profile-bio-text');
            if (!bioEl) {
                bioEl = document.createElement('p');
                bioEl.id = 'profile-bio-text';
                bioEl.style.cssText = 'font-size:13px; color:#555; text-align:center; margin:6px 16px 0; line-height:1.5;';
                const handleEl = document.querySelector('.profile-handle-text');
                if (handleEl) handleEl.insertAdjacentElement('afterend', bioEl);
            }
            bioEl.textContent = bio;

            // Show avatar in profile pic circle
            const avatarUrl = this.state.user.user_metadata?.avatar_url || null;
            const picEl = document.querySelector('.profile-pic-large');
            if (picEl) {
                if (avatarUrl) {
                    picEl.style.backgroundImage = `url('${avatarUrl}')`;
                    picEl.style.backgroundSize = 'cover';
                    picEl.style.backgroundPosition = 'center';
                } else {
                    picEl.style.backgroundImage = '';
                }
            }
            
            // Also update the top left name
            const headerName = document.querySelector('.profile-name-dropdown');
            if (headerName) {
                headerName.innerHTML = `${displayHandle.replace('@', '')} <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
            }

            // Real-time Following count (only needed if normal user, but we can just fetch it)
            if (!isVerified) {
                supabaseClient
                    .from('follows')
                    .select('*', { count: 'exact', head: true })
                    .eq('follower_id', this.state.user.id)
                    .then(({ count, error }) => {
                        if (!error) {
                            const followingVal = document.querySelector('#stat-following .val');
                            if (followingVal) followingVal.textContent = count || 0;
                        }
                    });
            } else {
                // Real-time Followers count for verified users
                supabaseClient
                    .from('follows')
                    .select('*', { count: 'exact', head: true })
                    .eq('following_id', this.state.user.id)
                    .then(({ count, error }) => {
                        if (!error) {
                            const followersVal = document.querySelector('#stat-followers .val');
                            if (followersVal) followersVal.textContent = count || 0;
                        }
                    });
                    
                // Real-time Likes count for verified users
                // Attempting to query a generic 'likes' table (will silently fail and stay 0 if table doesn't exist)
                supabaseClient
                    .from('likes')
                    .select('*', { count: 'exact', head: true })
                    .eq('author_id', this.state.user.id)
                    .then(({ count, error }) => {
                        if (!error) {
                            const likesVal = document.querySelector('#stat-likes .val');
                            if (likesVal) likesVal.textContent = count || 0;
                        }
                    });
            }
                
            this.renderProfileGrid();
            this.updateInboxUI();
        } else {
            this.updateInboxUI();
        }
    }
    
    async updateInboxUI() {
        const isAdmin = this.state.user && this.state.user.email === 'meshackurassa2@gmail.com';
        
        let isVerified = isAdmin;
        if (!isAdmin && this.state.user) {
            const { data: profile } = await supabaseClient.from('profiles').select('is_verified').eq('id', this.state.user.id).single();
            if (profile && profile.is_verified === true) isVerified = true;
        }
        
        const newFollowersRow = document.getElementById('inbox-new-followers');
        const activitiesRow = document.getElementById('inbox-activities');
        const inboxNavBtn = document.getElementById('nav-inbox-btn');
        
        if (newFollowersRow) newFollowersRow.style.display = isVerified ? 'flex' : 'none';
        if (activitiesRow) activitiesRow.style.display = isVerified ? 'flex' : 'none';
        if (inboxNavBtn) inboxNavBtn.style.display = isVerified ? 'flex' : 'none';
        
        // Fetch real-time text if verified
        if (isVerified && this.state.user) {
            // New followers
            supabaseClient.from('follows')
                .select('follower_id')
                .eq('following_id', this.state.user.id)
                .order('created_at', {ascending: false})
                .limit(1)
                .maybeSingle()
                .then(async ({ data: latestFollow }) => {
                    if (latestFollow) {
                        const { data: p } = await supabaseClient.from('profiles').select('username').eq('id', latestFollow.follower_id).maybeSingle();
                        const text = document.getElementById('inbox-new-followers-text');
                        if (text) text.textContent = `${p && p.username ? p.username : 'Someone'} started following you`;
                    }
                });
                
            // Activities (Likes)
            supabaseClient.from('likes')
                .select('user_id')
                .order('created_at', {ascending: false})
                .limit(1)
                .maybeSingle()
                .then(async ({ data: latestLike }) => {
                    if (latestLike) {
                        const { data: p } = await supabaseClient.from('profiles').select('username').eq('id', latestLike.user_id).maybeSingle();
                        const text = document.getElementById('inbox-activities-text');
                        if (text) text.textContent = `${p && p.username ? p.username : 'Someone'} liked a video`;
                    }
                });
        }
    }

    async renderProfileGrid() {
        if (!this.state.isAuthenticated) return;
        
        const profileGrid = document.querySelector('.profile-grid');
        if (!profileGrid) return;
        
        profileGrid.innerHTML = '';
        
        const { data: videos, error } = await supabaseClient
            .from('videos')
            .select('*')
            .eq('user_id', this.state.user.id)
            .order('created_at', { ascending: false });
            
        if (!error && videos && videos.length > 0) {
            videos.forEach(video => {
                const item = document.createElement('div');
                item.className = 'grid-item';
                item.onclick = () => this.openProfileVideo(video.id);
                item.innerHTML = `<video src="${video.video_url}#t=0.1" style="width:100%; height:100%; object-fit:cover;" preload="metadata" muted></video>`;
                profileGrid.appendChild(item);
            });
        }
    }

    async openProfileVideo(startVideoId) {
        // Fetch all profile videos so we can swipe through them
        const { data: videos, error } = await supabaseClient
            .from('video_details')
            .select('*')
            .eq('author_id', this.state.user.id)
            .order('created_at', { ascending: false });

        if (error || !videos || videos.length === 0) return;

        // Reorder array so clicked video is first
        const clickedVideoIndex = videos.findIndex(v => v.id === startVideoId);
        let sortedVideos = videos;
        if (clickedVideoIndex > 0) {
            const clicked = videos.splice(clickedVideoIndex, 1)[0];
            sortedVideos = [clicked, ...videos];
        }

        // Configure UI for Profile Video mode
        this.isProfileVideoMode = true;
        
        // Hide standard nav, show back button
        document.getElementById('home-live-icon').style.display = 'none';
        document.getElementById('home-nav-tabs').style.display = 'none';
        document.getElementById('home-search-icon').style.display = 'none';
        
        const backBtn = document.getElementById('home-back-btn');
        backBtn.style.display = 'flex';
        backBtn.classList.remove('hidden');
        
        // Hide bottom nav
        document.getElementById('main-nav').style.display = 'none';

        // Render feed and navigate
        await this.renderFeedData(sortedVideos);
        this.handleNavClick('home-view', true); // pass true to skip main-nav update
    }

    closeProfileVideo() {
        this.isProfileVideoMode = false;
        
        // Restore standard UI
        document.getElementById('home-live-icon').style.display = 'flex';
        document.getElementById('home-nav-tabs').style.display = 'flex';
        document.getElementById('home-search-icon').style.display = 'flex';
        
        const backBtn = document.getElementById('home-back-btn');
        backBtn.style.display = 'none';
        backBtn.classList.add('hidden');
        
        document.getElementById('main-nav').style.display = 'flex';

        // Return to profile
        this.handleNavClick('profile-view');
        
        // Reset feed
        this.renderFeed();
    }

    openEditProfileModal() {
        const modal = document.getElementById('edit-profile-modal');
        modal.classList.remove('hidden');

        const user = this.state.user;
        document.getElementById('edit-username').value = user?.user_metadata?.username || '';
        document.getElementById('edit-bio').value = user?.user_metadata?.bio || '';
        document.getElementById('edit-profile-error').classList.add('hidden');

        // Load current avatar
        const avatarImg = document.getElementById('edit-profile-avatar-img');
        const avatarPlaceholder = document.getElementById('edit-profile-avatar-placeholder');
        const currentAvatar = user?.user_metadata?.avatar_url;
        if (currentAvatar) {
            avatarImg.src = currentAvatar;
            avatarImg.style.display = 'block';
            avatarPlaceholder.style.display = 'none';
        } else {
            avatarImg.style.display = 'none';
            avatarPlaceholder.style.display = 'block';
        }
        this._pendingAvatarDataUrl = null;
    }

    closeEditProfileModal() {
        document.getElementById('edit-profile-modal').classList.add('hidden');
    }

    handleAvatarChange(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            this._pendingAvatarDataUrl = dataUrl;
            const avatarImg = document.getElementById('edit-profile-avatar-img');
            const avatarPlaceholder = document.getElementById('edit-profile-avatar-placeholder');
            avatarImg.src = dataUrl;
            avatarImg.style.display = 'block';
            avatarPlaceholder.style.display = 'none';
        };
        reader.readAsDataURL(file);
    }

    async saveProfile() {
        const username = document.getElementById('edit-username').value.trim();
        const bio = document.getElementById('edit-bio').value.trim();
        const errorDiv = document.getElementById('edit-profile-error');

        if (!username) {
            errorDiv.textContent = 'Username cannot be empty';
            errorDiv.classList.remove('hidden');
            return;
        }

        const btn = document.getElementById('btn-save-profile');
        btn.textContent = 'Saving...';
        btn.disabled = true;

        let avatarUrl = this.state.user?.user_metadata?.avatar_url || null;

        // Upload avatar if a new one was selected
        if (this._pendingAvatarDataUrl) {
            try {
                const fileInput = document.getElementById('edit-profile-avatar-input');
                const file = fileInput.files[0];
                if (file) {
                    const ext = file.name.split('.').pop();
                    const fileName = `avatars/${this.state.user.id}.${ext}`;
                    const { data: uploadData, error: uploadError } = await supabaseClient.storage
                        .from('videos')
                        .upload(fileName, file, { upsert: true });
                    if (!uploadError) {
                        const { data: urlData } = supabaseClient.storage.from('videos').getPublicUrl(fileName);
                        avatarUrl = urlData.publicUrl;
                    } else {
                        console.warn('Avatar upload failed:', uploadError.message);
                        // Fallback: store as base64 in metadata (small images only)
                        avatarUrl = this._pendingAvatarDataUrl;
                    }
                }
            } catch(e) {
                console.warn('Avatar upload error:', e);
                avatarUrl = this._pendingAvatarDataUrl;
            }
        }

        const { data, error } = await supabaseClient.auth.updateUser({
            data: { username, bio, avatar_url: avatarUrl }
        });

        if (error) {
            errorDiv.textContent = error.message;
            errorDiv.classList.remove('hidden');
        } else {
            this.state.user = data.user;
            // Also update profiles table
            await supabaseClient.from('profiles').upsert({
                id: this.state.user.id,
                username,
                bio,
                avatar_url: avatarUrl
            });
            this.updateProfileUI();
            this.closeEditProfileModal();
        }

        btn.textContent = 'Save Changes';
        btn.disabled = false;
    }

    async openAdminDashboard() {
        if (!this.state.user || this.state.user.email !== 'meshackurassa2@gmail.com') return;
        
        document.getElementById('admin-dashboard-modal').classList.remove('hidden');
        const listDiv = document.getElementById('admin-users-list');
        listDiv.innerHTML = '<div style="text-align:center; padding:20px;">Loading users...</div>';
        
        // Fetch real profiles
        const { data: profiles, error } = await supabaseClient
            .from('profiles')
            .select('*');
            
        if (error) {
            listDiv.innerHTML = `<div style="text-align:center; padding:20px; color:red;">Failed to load users: ${error.message}</div>`;
            return;
        }
        
        if (!profiles || profiles.length === 0) {
            listDiv.innerHTML = '<div style="text-align:center; padding:20px;">No users found.</div>';
            return;
        }
        
        listDiv.innerHTML = '';
        profiles.forEach(profile => {
            // Skip the admin themselves in the management list (optional, but good practice)
            if (profile.email === 'meshackurassa2@gmail.com') return;
            
            const isVerified = profile.is_verified === true;
            const btnColor = isVerified ? '#eee' : 'var(--tiktok-red)';
            const btnTextColor = isVerified ? '#333' : 'white';
            const btnText = isVerified ? 'Revoke' : 'Verify';
            
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #eee;';
            row.innerHTML = `
                <div>
                    <strong>${profile.username || 'Anonymous'}</strong><br>
                    <span style="font-size:12px; color:#888;">${profile.email || profile.id}</span>
                </div>
                <button class="verify-btn" data-id="${profile.id}" data-verified="${isVerified}" style="background:${btnColor}; color:${btnTextColor}; border:none; padding:6px 12px; border-radius:4px; font-weight:600;">${btnText}</button>
            `;
            
            const btn = row.querySelector('.verify-btn');
            btn.onclick = () => this.toggleUserVerification(profile.id, btn);
            listDiv.appendChild(row);
        });
    }
    
    closeAdminDashboard() {
        document.getElementById('admin-dashboard-modal').classList.add('hidden');
    }
    
    async toggleUserVerification(userId, btn) {
        const currentlyVerified = btn.getAttribute('data-verified') === 'true';
        const newStatus = !currentlyVerified;
        
        btn.textContent = 'Updating...';
        btn.disabled = true;
        
        const { error } = await supabaseClient
            .from('profiles')
            .update({ is_verified: newStatus })
            .eq('id', userId);
            
        btn.disabled = false;
        
        if (error) {
            alert("Failed to update user: " + error.message);
            // Revert button text
            btn.textContent = currentlyVerified ? 'Revoke' : 'Verify';
        } else {
            // Update successful
            btn.setAttribute('data-verified', newStatus);
            if (newStatus) {
                btn.textContent = 'Revoke';
                btn.style.background = '#eee';
                btn.style.color = '#333';
            } else {
                btn.textContent = 'Verify';
                btn.style.background = 'var(--tiktok-red)';
                btn.style.color = 'white';
            }
        }
    }

    switchTab(viewId) {
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
            view.classList.add('hidden');
        });

        const target = document.getElementById(viewId);
        target.classList.remove('hidden');
        target.classList.add('active');

        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        
        const navMapping = { 'home-view': 0, 'friends-view': 1, 'upload-view': 2, 'inbox-view': 3, 'profile-view': 4 };
        if(navMapping[viewId] !== undefined) {
            document.querySelectorAll('.nav-item')[navMapping[viewId]].classList.add('active');
        }

        // Camera handling
        if (viewId === 'upload-view') {
            this.startCamera();
        } else {
            this.stopCamera();
        }

        // Pause feed videos if leaving home
        if (viewId !== 'home-view') {
            document.querySelectorAll('.media-video').forEach(v => v.pause());
            document.querySelectorAll('.record-spin').forEach(r => r.classList.add('paused'));
        }
    }

    // --- SEARCH LOGIC ---
    openSearch() {
        const sv = document.getElementById('search-view');
        sv.style.display = 'flex';
        setTimeout(() => document.getElementById('search-input').focus(), 100);
    }

    closeSearch() {
        document.getElementById('search-view').style.display = 'none';
        document.getElementById('search-input').value = '';
        document.getElementById('search-results-container').innerHTML = '<div style="color:#aaa; text-align:center; padding-top:60px; font-size:14px;">Type to search users or videos...</div>';
    }

    async performSearch(query) {
        const container = document.getElementById('search-results-container');
        
        if (!query || query.trim().length === 0) {
            container.innerHTML = '<div style="color:#888; text-align:center; padding-top:40px;">Type to search for users or videos in real-time...</div>';
            return;
        }

        container.innerHTML = '<div style="color:#888; text-align:center; padding-top:40px;">Searching...</div>';

        // Search profiles
        const { data: users, error: userError } = await supabaseClient
            .from('profiles')
            .select('*')
            .ilike('username', `%${query}%`)
            .limit(5);

        // Search videos (video_details view or videos table caption)
        const { data: videos, error: vidError } = await supabaseClient
            .from('videos')
            .select('*')
            .ilike('caption', `%${query}%`)
            .limit(5);

        container.innerHTML = '';
        let hasResults = false;

        if (users && users.length > 0) {
            hasResults = true;
            container.innerHTML += '<h4 style="margin-bottom:10px; color:#555;">Users</h4>';
            users.forEach(u => {
                container.innerHTML += `
                    <div style="display:flex; align-items:center; padding:10px 0; border-bottom:1px solid #f1f1f1;">
                        <div style="width:40px; height:40px; border-radius:50%; background:#ddd; margin-right:15px;"></div>
                        <div>
                            <div style="font-weight:600;">${u.username || 'Anonymous'} ${u.is_verified ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="#20D5EC" style="vertical-align:middle"><path d="M12 2L15 8L22 9L17 14L18.5 21L12 17.5L5.5 21L7 14L2 9L9 8L12 2Z"></path></svg>' : ''}</div>
                            <div style="font-size:12px; color:#888;">${u.email || ''}</div>
                        </div>
                    </div>
                `;
            });
        }

        if (videos && videos.length > 0) {
            hasResults = true;
            container.innerHTML += '<h4 style="margin-top:20px; margin-bottom:10px; color:#555;">Videos</h4>';
            videos.forEach(v => {
                container.innerHTML += `
                    <div style="display:flex; align-items:center; padding:10px 0; border-bottom:1px solid #f1f1f1;">
                        <div style="width:60px; height:80px; background:#000; border-radius:4px; margin-right:15px; overflow:hidden;">
                            <video src="${v.video_url}" style="width:100%; height:100%; object-fit:cover;"></video>
                        </div>
                        <div style="flex-grow:1;">
                            <div style="font-size:14px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${v.caption}</div>
                            <div style="font-size:12px; color:#888; margin-top:5px;">Watch now</div>
                        </div>
                    </div>
                `;
            });
        }

        if (!hasResults) {
            container.innerHTML = '<div style="color:#888; text-align:center; padding-top:40px;">No results found.</div>';
        }
    }

    switchFeed(type) {
        this.state.feedType = type;
        document.getElementById('tab-following').classList.toggle('active', type === 'following');
        document.getElementById('tab-foryou').classList.toggle('active', type === 'foryou');
        this.renderFeed();
    }

    // --- HOME FEED & VIDEO LOGIC ---
    async renderFeed() {
        if (this.isProfileVideoMode) return; // Managed by openProfileVideo

        const container = document.getElementById('feed-container');
        container.innerHTML = `
            <div class="skeleton-bg">
                <div class="skeleton-item" style="bottom: 20px; left: 16px; width: 60%; height: 20px;"></div>
                <div class="skeleton-item" style="bottom: 50px; left: 16px; width: 40%; height: 24px;"></div>
                <div class="skeleton-item" style="bottom: 20px; right: 16px; width: 40px; height: 40px; border-radius: 50%;"></div>
                <div class="skeleton-item" style="bottom: 80px; right: 16px; width: 40px; height: 40px; border-radius: 50%;"></div>
                <div class="skeleton-item" style="bottom: 140px; right: 16px; width: 40px; height: 40px; border-radius: 50%;"></div>
                <div class="skeleton-item" style="bottom: 200px; right: 16px; width: 48px; height: 48px; border-radius: 50%;"></div>
            </div>`;

        let query = supabaseClient.from('video_details').select('*');
        
        if (this.state.feedType === 'foryou') {
            query = query.order('trending_score', { ascending: false });
        } else if (this.state.feedType === 'following') {
            query = query.order('created_at', { ascending: false });
            if (!this.state.isAuthenticated) {
                container.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100%; color:white; padding:40px; text-align:center;">Please log in to see videos from creators you follow.</div>';
                return;
            }
            
            // Get follows
            const { data: follows, error: followError } = await supabaseClient
                .from('follows')
                .select('following_id')
                .eq('follower_id', this.state.user.id);
            
            if (followError || !follows || follows.length === 0) {
                container.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100%; color:white; padding:40px; text-align:center;">You are not following anyone yet.</div>';
                return;
            }
            
            const followingIds = follows.map(f => f.following_id);
            query = query.in('author_id', followingIds);
        }

        // Fetch real videos from the database view
        const { data: videos, error } = await query;
        
        let userFollowingIds = new Set();
        if (this.state.isAuthenticated) {
            const { data: userFollows } = await supabaseClient
                .from('follows')
                .select('following_id')
                .eq('follower_id', this.state.user.id);
            if (userFollows) userFollowingIds = new Set(userFollows.map(f => f.following_id));
        }

        this.renderFeedData(videos, error, userFollowingIds);
    }

    async renderFeedData(videos, error = null, userFollowingIds = new Set()) {
        const container = document.getElementById('feed-container');
        const template = document.getElementById('media-template');

        if (error || !videos || videos.length === 0) {
            container.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100%; color:white; padding:40px; text-align:center;">No videos yet! Be the first to upload.</div>';
            return;
        }

        videos.forEach(media => {
            const clone = template.content.cloneNode(true);
            const mediaItem = clone.querySelector('.media-item');
            const video = clone.querySelector('.media-video');
            
            // Setup follow badge
            const followBadge = clone.querySelector('.follow-badge');
            if (followBadge) {
                if (this.state.isAuthenticated && (media.author_id === this.state.user.id || userFollowingIds.has(media.author_id))) {
                    followBadge.style.display = 'none';
                } else {
                    followBadge.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (!this.state.isAuthenticated) return this.showAuthModal();
                        
                        followBadge.style.display = 'none'; // Optimistic
                        
                        const { error: followError } = await supabaseClient.from('follows').insert({
                            follower_id: this.state.user.id,
                            following_id: media.author_id
                        });
                        
                        if (followError) {
                            followBadge.style.display = 'flex'; // Revert on fail
                            console.error('Follow failed:', followError);
                        }
                    });
                }
            }
            
            video.src = media.video_url;
            
            // Apply Edits (Crop & Text)
            if (media.edits) {
                if (media.edits.crop) {
                    const c = media.edits.crop;
                    video.style.transform = `translate(${c.transX * c.scale}px, ${c.transY * c.scale}px) scale(${c.scale})`;
                }
                if (media.edits.texts && media.edits.texts.length > 0) {
                    const txtLayer = clone.querySelector('.video-overlay-layer') || document.createElement('div');
                    if (!txtLayer.className.includes('video-overlay-layer')) {
                        txtLayer.className = 'video-overlay-layer';
                        txtLayer.style.position = 'absolute';
                        txtLayer.style.top = '0'; txtLayer.style.left = '0';
                        txtLayer.style.width = '100%'; txtLayer.style.height = '100%';
                        txtLayer.style.pointerEvents = 'none';
                        txtLayer.style.zIndex = '2';
                        video.parentElement.appendChild(txtLayer);
                    }
                    media.edits.texts.forEach(t => {
                        const tel = document.createElement('div');
                        tel.textContent = t.text;
                        tel.style.position = 'absolute';
                        tel.style.left = '50%'; tel.style.top = '50%';
                        tel.style.transform = 'translate(-50%, -50%)';
                        tel.style.fontFamily = t.font;
                        tel.style.color = t.color;
                        tel.style.textShadow = '0 2px 4px rgba(0,0,0,0.8)';
                        tel.style.fontWeight = 'bold';
                        tel.style.fontSize = '24px';
                        tel.style.whiteSpace = 'nowrap';
                        txtLayer.appendChild(tel);
                    });
                }
            }
            
            mediaItem.querySelector('.author-name').textContent = `@${media.author_username || 'user'}`;
            mediaItem.querySelector('.caption').innerHTML = (media.caption || '').replace(/#(\w+)/g, '<span class="tag">#$1</span>');
            mediaItem.querySelector('.likes-count').textContent = media.like_count || 0;
            mediaItem.querySelector('.comments-count').textContent = 0; // Not implemented yet
            mediaItem.querySelector('.marquee-content').textContent = `Original Sound - @${media.author_username || 'user'}`;

            const profileImg = mediaItem.querySelector('.profile-img');
            if (media.author_avatar_url) {
                profileImg.style.backgroundImage = `url('${media.author_avatar_url}')`;
            } else {
                const defaultAvatar = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23ccc'><path d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/></svg>";
                profileImg.style.backgroundImage = `url("${defaultAvatar}")`;
                profileImg.style.backgroundSize = "cover";
                profileImg.style.backgroundColor = "#333";
            }

            // Store ID on the DOM element for likes/unlocks
            mediaItem.dataset.videoId = media.id;
            
            // Interactivity setup
            this.setupVideoInteractions(mediaItem, video);

            // Paywall
            const paywall = mediaItem.querySelector('.paywall-glass');
            if (media.is_premium && !this.state.unlockedMedia.has(media.id)) {
                paywall.classList.remove('hidden');
                paywall.querySelector('.unlock-btn').textContent = `Unlock for ${media.price} TZS`;
                paywall.querySelector('.unlock-btn').onclick = () => this.unlockMedia(media.id, media.price, paywall, video);
            }
            const likeBtn = clone.querySelector('.btn-like');
            const heartIcon = likeBtn.querySelector('.heart-icon');
            const likesCount = likeBtn.querySelector('.likes-count');
            
            let liked = false;
            let baseLikes = parseInt(media.like_count || 0);
            
            // Check if current user already liked this video
            if (this.state.user) {
                supabaseClient.from('likes')
                    .select('id')
                    .eq('video_id', media.id)
                    .eq('user_id', this.state.user.id)
                    .maybeSingle()
                    .then(({data}) => {
                        if (data) {
                            liked = true;
                            heartIcon.setAttribute('fill', 'var(--tiktok-red)');
                            heartIcon.setAttribute('stroke', 'var(--tiktok-red)');
                        }
                    });
            }

            likeBtn.addEventListener('click', async () => {
                if (!this.state.isAuthenticated) return this.showAuthModal();
                
                liked = !liked;
                
                if (liked) {
                    heartIcon.setAttribute('fill', 'var(--tiktok-red)');
                    heartIcon.setAttribute('stroke', 'var(--tiktok-red)');
                    heartIcon.classList.remove('heart-pop');
                    void heartIcon.offsetWidth; // force reflow to restart animation
                    heartIcon.classList.add('heart-pop');
                    baseLikes++;
                    likesCount.textContent = baseLikes;
                    const { error } = await supabaseClient.from('likes').upsert(
                        [{ video_id: media.id, user_id: this.state.user.id }],
                        { onConflict: 'video_id,user_id', ignoreDuplicates: true }
                    );
                    if (error) {
                        // Revert on failure
                        liked = false;
                        heartIcon.setAttribute('fill', 'rgba(0,0,0,0.3)');
                        heartIcon.setAttribute('stroke', 'white');
                        baseLikes--;
                        likesCount.textContent = baseLikes;
                        console.error('Like failed:', error.message);
                    }
                } else {
                    heartIcon.setAttribute('fill', 'rgba(0,0,0,0.3)');
                    heartIcon.setAttribute('stroke', 'white');
                    baseLikes--;
                    likesCount.textContent = baseLikes;
                    await supabaseClient.from('likes').delete().eq('video_id', media.id).eq('user_id', this.state.user.id);
                }
            });

            // Comment Action
            const commentBtn = clone.querySelector('.btn-comment');
            commentBtn.addEventListener('click', () => {
                this.openCommentsSheet(media);
            });

            // Bookmark Action
            const bookmarkBtn = clone.querySelector('.btn-bookmark');
            let bookmarked = false;
            let baseBookmarks = 0; // Initialize to 0 or fetch from DB
            const bookmarkIcon = bookmarkBtn.querySelector('.bookmark-icon');
            const bookmarksCount = bookmarkBtn.querySelector('.bookmarks-count');
            
            bookmarkBtn.addEventListener('click', () => {
                if (!this.state.isAuthenticated) return this.showAuthModal();
                
                bookmarked = !bookmarked;
                if (bookmarked) {
                    bookmarkIcon.setAttribute('fill', '#eab308');
                    baseBookmarks++;
                    bookmarksCount.textContent = baseBookmarks;
                } else {
                    bookmarkIcon.setAttribute('fill', 'white');
                    baseBookmarks--;
                    bookmarksCount.textContent = baseBookmarks;
                }
            });

            // Share Action
            const shareBtn = clone.querySelector('.btn-share');
            shareBtn.addEventListener('click', () => {
                if (navigator.share) {
                    navigator.share({ title: 'Simulizi', url: media.video_url }).catch(console.error);
                } else {
                    alert('Share this video URL: ' + media.video_url);
                }
            });

            // Add double tap to like on the video wrapper
            const videoWrapper = clone.querySelector('.media-item');
            let lastTap = 0;
            videoWrapper.addEventListener('click', (e) => {
                const currentTime = new Date().getTime();
                const tapLength = currentTime - lastTap;
                if (tapLength < 300 && tapLength > 0) {
                    // Double tap
                    if (!liked) likeBtn.click();
                    const heartAnim = videoWrapper.querySelector('.double-tap-heart');
                    if(heartAnim) {
                        heartAnim.classList.remove('hidden');
                        heartAnim.classList.add('show');
                        setTimeout(() => {
                            heartAnim.classList.remove('show');
                            heartAnim.classList.add('hidden');
                        }, 800);
                    }
                    e.preventDefault();
                }
                lastTap = currentTime;
            });

            container.appendChild(clone);
            // Attach intersection observer for autoplay
            if (this.feedObserver) this.feedObserver.observe(mediaItem);
        });
    }

    openCommentsSheet(media) {
        this.currentMediaForComment = media;
        const sheet = document.getElementById('comments-sheet');
        const overlay = document.getElementById('comments-sheet-overlay');
        overlay.style.display = 'block';
        // Trigger slide up animation
        requestAnimationFrame(() => {
            sheet.style.transform = 'translateY(0)';
        });

        // Update title
        const title = document.getElementById('comments-title');
        if (title) title.textContent = 'Comments';

        // Update input avatar
        const inputAvatar = document.getElementById('comment-input-avatar');
        const userAvatar = this.state.user?.user_metadata?.avatar_url;
        if (inputAvatar) {
            if (userAvatar) {
                inputAvatar.innerHTML = `<img src="${userAvatar}" style="width:100%;height:100%;object-fit:cover;">`;
            } else {
                inputAvatar.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#bbb" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
            }
        }

        // Fetch real comments from supabase
        const list = document.getElementById('comments-list');
        list.innerHTML = `<div style="display:flex;justify-content:center;padding:30px;"><div style="width:24px;height:24px;border-radius:50%;border:3px solid #eee;border-top-color:var(--tiktok-red);animation:spin 0.8s linear infinite;"></div></div>`;

        supabaseClient
            .from('comments')
            .select('*, profiles(username, avatar_url)')
            .eq('video_id', media.id)
            .order('created_at', { ascending: true })
            .then(({ data: comments, error }) => {
                list.innerHTML = '';
                if (error || !comments || comments.length === 0) {
                    list.innerHTML = `<div style="display:flex;justify-content:center;align-items:center;height:100%;color:#999;font-size:14px;">No comments yet. Be the first!</div>`;
                    return;
                }
                comments.forEach(c => this.renderCommentCard(c, list));
            });
    }

    renderCommentCard(comment, list) {
        const username = comment.profiles?.username || 'user';
        const avatar = comment.profiles?.avatar_url;
        const time = this.timeAgo(comment.created_at);

        const div = document.createElement('div');
        div.style.cssText = 'display:flex; gap:12px; align-items:flex-start;';
        div.innerHTML = `
            <div style="width:40px;height:40px;min-width:40px;border-radius:50%;background:#eee;overflow:hidden;display:flex;align-items:center;justify-content:center;">
                ${avatar
                    ? `<img src="${avatar}" style="width:100%;height:100%;object-fit:cover;">`
                    : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`
                }
            </div>
            <div style="flex:1;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                    <span style="font-weight:700;font-size:13px;color:#111;">@${username}</span>
                    <span style="font-size:11px;color:#999;">${time}</span>
                    <span style="font-size:11px;color:#999;font-weight:600;cursor:pointer;" onclick="const inp = document.getElementById('new-comment-input'); inp.value = '@${username} ' + inp.value; inp.focus();">Reply</span>
                </div>
                <div style="font-size:14px;color:#333;line-height:1.5;">${comment.text || ''}</div>
            </div>
            <button style="background:none;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;padding-top:2px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
                <span style="font-size:10px;color:#999;">0</span>
            </button>
        `;
        list.appendChild(div);
    }

    timeAgo(dateStr) {
        const diff = Date.now() - new Date(dateStr).getTime();
        const s = Math.floor(diff / 1000);
        if (s < 60) return `${s}s`;
        if (s < 3600) return `${Math.floor(s/60)}m`;
        if (s < 86400) return `${Math.floor(s/3600)}h`;
        return `${Math.floor(s/86400)}d`;
    }

    closeCommentsSheet() {
        const sheet = document.getElementById('comments-sheet');
        const overlay = document.getElementById('comments-sheet-overlay');
        sheet.style.transform = 'translateY(100%)';
        overlay.style.display = 'none';
    }

    async postComment() {
        if (!this.state.isAuthenticated) return this.showAuthModal();
        const input = document.getElementById('new-comment-input');
        const btn = document.getElementById('btn-post-comment');
        const text = input.value.trim();
        if (!text) return;

        btn.disabled = true;
        btn.style.opacity = '0.5';

        const media = this.currentMediaForComment;
        const username = this.state.user.user_metadata?.username || this.state.user.email.split('@')[0];
        const avatar = this.state.user.user_metadata?.avatar_url || null;

        // Insert into DB
        const { data, error } = await supabaseClient.from('comments').insert([{
            video_id: media.id,
            user_id: this.state.user.id,
            text: text
        }]).select('*, profiles(username, avatar_url)').single();

        if (error) {
            console.error("Comment error:", error);
            alert("Failed to post comment. Did you run the SQL migration for the comments table? Error: " + error.message);
            btn.disabled = false;
            btn.style.opacity = '1';
            return;
        }

        const list = document.getElementById('comments-list');
        // Remove empty placeholder if present
        if (list.textContent.includes('No comments yet')) list.innerHTML = '';

        // Render card from response or locally
        const commentData = data || {
            text,
            created_at: new Date().toISOString(),
            profiles: { username, avatar_url: avatar }
        };
        this.renderCommentCard(commentData, list);

        // Update comment count in feed
        const mediaItems = document.querySelectorAll('.media-item');
        mediaItems.forEach(item => {
            if (item.dataset.videoId === media.id) {
                const countEl = item.querySelector('.comments-count');
                if (countEl) {
                    countEl.textContent = parseInt(countEl.textContent || 0) + 1;
                }
            }
        });

        input.value = '';
        btn.disabled = false;
        btn.style.opacity = '1';
        list.scrollTop = list.scrollHeight;
    }

    setupVideoInteractions(mediaItem, video) {
        let lastTap = 0;
        const playPauseInd = mediaItem.querySelector('.play-pause-indicator');
        const doubleTapHeart = mediaItem.querySelector('.double-tap-heart');
        const likeBtn = mediaItem.querySelector('.stack-item'); // First item is heart
        const recordSpin = mediaItem.querySelector('.record-spin');
        const videoId = mediaItem.dataset.videoId;

        // Ensure user sees their like status on load
        if (this.state.isAuthenticated && this.state.user) {
            supabaseClient.from('likes')
                .select('id')
                .eq('video_id', videoId)
                .eq('user_id', this.state.user.id)
                .single()
                .then(({data}) => {
                    if (data) likeBtn.classList.add('liked');
                });
        }

        // Tap video handling
        video.addEventListener('click', (e) => {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;
            
            if (tapLength < 300 && tapLength > 0) {
                // Double tap
                this.triggerLike(doubleTapHeart, likeBtn, videoId);
                e.preventDefault();
            } else {
                // Single tap
                if (video.paused) {
                    video.play();
                    playPauseInd.classList.remove('show');
                    recordSpin.classList.remove('paused');
                } else {
                    video.pause();
                    playPauseInd.classList.add('show');
                    recordSpin.classList.add('paused');
                }
            }
            lastTap = currentTime;
        });

        // Like button explicit click
        likeBtn.addEventListener('click', () => {
            this.toggleLike(likeBtn, videoId);
        });
    }

    async toggleLike(likeBtn, videoId) {
        if (!this.state.isAuthenticated) {
            this.showAuthModal();
            return;
        }

        const isLiked = likeBtn.classList.contains('liked');
        const countSpan = likeBtn.querySelector('.likes-count');
        let currentCount = parseInt(countSpan.textContent) || 0;

        if (isLiked) {
            // Unlike
            likeBtn.classList.remove('liked');
            countSpan.textContent = currentCount - 1;
            await supabaseClient.from('likes').delete()
                .eq('video_id', videoId)
                .eq('user_id', this.state.user.id);
        } else {
            // Like
            likeBtn.classList.add('liked');
            countSpan.textContent = currentCount + 1;
            await supabaseClient.from('likes').insert({
                video_id: videoId,
                user_id: this.state.user.id
            });
        }
    }

    async triggerLike(animHeart, likeBtn, videoId) {
        if (!likeBtn.classList.contains('liked')) {
            await this.toggleLike(likeBtn, videoId);
        }
        animHeart.classList.remove('hidden');
        animHeart.classList.remove('animate');
        // trigger reflow
        void animHeart.offsetWidth;
        animHeart.classList.add('animate');
    }

    setupIntersectionObserver() {
        const options = { root: document.getElementById('feed-container'), threshold: 0.6 };
        
        this.feedObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const video = entry.target.querySelector('.media-video');
                if (!video) return;
                const paywall = entry.target.querySelector('.paywall-glass');
                const recordSpin = entry.target.querySelector('.record-spin');
                const playPauseInd = entry.target.querySelector('.play-pause-indicator');

                if (entry.isIntersecting) {
                    if (!paywall || paywall.classList.contains('hidden')) {
                        if (this.audioUnlocked) video.muted = false;
                        // Attempt to play automatically (might be blocked until user interacts)
                        const playPromise = video.play();
                        if (playPromise !== undefined) {
                            playPromise.then(() => {
                                // Increment view count safely once it starts playing
                                const vidId = entry.target.dataset.videoId;
                                if (vidId && (!this.state.viewedVideos || !this.state.viewedVideos.has(vidId))) {
                                    if (!this.state.viewedVideos) this.state.viewedVideos = new Set();
                                    this.state.viewedVideos.add(vidId);
                                    supabaseClient.rpc('increment_view_count', { vid: vidId }).catch(e => console.error(e));
                                }
                            }).catch(() => {
                                // Autoplay with sound blocked. Will play when user interacts (unlockAudio)
                                if (recordSpin) recordSpin.classList.add('paused');
                                if (playPauseInd) playPauseInd.classList.remove('show');
                            });
                        }
                        if (recordSpin) recordSpin.classList.remove('paused');
                        if (playPauseInd) playPauseInd.classList.remove('show');
                    }
                } else {
                    video.pause();
                    video.currentTime = 0;
                    if (recordSpin) recordSpin.classList.add('paused');
                }
            });
        }, options);
    }

    unlockMedia(id, price, paywallElement, video) {
        if (this.state.balance >= price) {
            this.state.balance -= price;
            this.state.unlockedMedia.add(id);
            paywallElement.classList.add('hidden');
            video.play();
        } else {
            alert("Insufficient balance!");
        }
    }

    // --- UPLOAD / CAMERA ---
    async startCamera() {
        const videoElement = document.getElementById('webcam-video');
        // Show camera mode, hide gallery mode
        document.getElementById('upload-camera-mode').style.display = 'block';
        document.getElementById('upload-gallery-mode').style.display = 'none';
        try {
            this.state.cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
            videoElement.srcObject = this.state.cameraStream;
        } catch (err) {
            console.error('Camera access denied or unavailable', err);
        }
    }

    stopCamera() {
        if (this.state.cameraStream) {
            this.state.cameraStream.getTracks().forEach(track => track.stop());
            this.state.cameraStream = null;
        }
    }

    startRecording() {
        if (!this.state.cameraStream) return;

        const btn = document.getElementById('camera-record-btn');
        btn.style.background = '#fff';
        btn.style.borderRadius = '8px';

        let recordedChunks = [];
        this.mediaRecorder = new MediaRecorder(this.state.cameraStream, { mimeType: 'video/webm' });

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordedChunks.push(e.data);
        };

        this.mediaRecorder.onstop = () => {
            this.recordedBlob = new Blob(recordedChunks, { type: 'video/webm' });
            // Show post details form with preview
            this._showPostForm(URL.createObjectURL(this.recordedBlob));
        };

        this.mediaRecorder.start();

        // Stop after 60 seconds max, or user taps again
        this._recordingTimer = setTimeout(() => {
            if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                this.mediaRecorder.stop();
            }
        }, 60000);

        // Second tap stops recording
        btn.onclick = () => this.stopRecording();
    }

    stopRecording() {
        clearTimeout(this._recordingTimer);
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
        }
        const btn = document.getElementById('camera-record-btn');
        btn.style.background = 'var(--tiktok-red)';
        btn.style.borderRadius = '50%';
        btn.onclick = () => this.startRecording();
    }

    triggerGalleryPicker() {
        document.getElementById('gallery-file-input').click();
    }

    onGalleryFileSelected(event) {
        const file = event.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('video/')) {
            alert('Please select a video file.');
            return;
        }
        this.recordedBlob = file;
        this._showPostForm(URL.createObjectURL(file));
    }

    _showPostForm(blobUrl) {
        // Make sure the upload view is visible first!
        this.switchTab('upload-view');
        
        // Show post form directly
        const postForm = document.getElementById('upload-post-form');
        if (postForm) postForm.style.display = 'flex';

        const preview = document.getElementById('gallery-preview-video');
        if (preview) {
            preview.src = blobUrl;
            preview.play();
        }

        // Reset progress bar
        const progressWrap = document.getElementById('upload-progress-bar-wrap');
        if (progressWrap) progressWrap.style.display = 'none';
        
        const progressBar = document.getElementById('upload-progress-bar');
        if (progressBar) progressBar.style.width = '0%';
        
        const captionInput = document.getElementById('upload-caption-input');
        if (captionInput) captionInput.value = '';
    }

    mockEditAction(action) {
        const toast = document.getElementById('simulated-edit-toast');
        if (!toast) return;
        toast.style.display = 'block';
        toast.style.opacity = '1';
        toast.textContent = action === 'stickers' ? 'Stickers feature coming soon!' : 'Feature not implemented';
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => { toast.style.display = 'none'; }, 300);
        }, 1500);
    }

    // --- TEXT EDITOR LOGIC ---
    openTextEditor() {
        document.getElementById('text-editor-overlay').style.display = 'flex';
        document.getElementById('video-text-input').focus();
        if (!this.textState) {
            this.textState = { font: 'sans-serif', color: '#ffffff' };
            // Setup listeners
            document.querySelectorAll('.font-btn').forEach(btn => {
                btn.onclick = () => {
                    document.querySelectorAll('.font-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.textState.font = btn.dataset.font;
                    document.getElementById('video-text-input').style.fontFamily = this.textState.font;
                };
            });
            document.querySelectorAll('.color-btn').forEach(btn => {
                btn.onclick = () => {
                    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.textState.color = btn.dataset.color;
                    document.getElementById('video-text-input').style.color = this.textState.color;
                };
            });
        }
    }

    closeTextEditor() {
        document.getElementById('text-editor-overlay').style.display = 'none';
        document.getElementById('video-text-input').value = '';
    }

    addTextToVideo() {
        const text = document.getElementById('video-text-input').value.trim();
        if (text) {
            const layer = document.getElementById('video-text-layer');
            const el = document.createElement('div');
            el.className = 'draggable-text';
            el.textContent = text;
            el.style.fontFamily = this.textState.font;
            el.style.color = this.textState.color;
            el.style.left = '50%';
            el.style.top = '50%';
            el.style.pointerEvents = 'auto'; // allow dragging
            
            // Basic drag logic
            let isDragging = false, startX, startY, initialLeft, initialTop;
            const startDrag = (e) => {
                isDragging = true;
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                startX = clientX; startY = clientY;
                initialLeft = el.offsetLeft; initialTop = el.offsetTop;
            };
            const onDrag = (e) => {
                if (!isDragging) return;
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                el.style.left = (initialLeft + (clientX - startX)) + 'px';
                el.style.top = (initialTop + (clientY - startY)) + 'px';
            };
            const endDrag = () => { isDragging = false; };
            
            el.addEventListener('mousedown', startDrag);
            el.addEventListener('touchstart', startDrag, {passive: true});
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('touchmove', onDrag, {passive: true});
            document.addEventListener('mouseup', endDrag);
            document.addEventListener('touchend', endDrag);
            
            layer.appendChild(el);
            
            // Save state for upload
            if (!this.videoEdits) this.videoEdits = {};
            if (!this.videoEdits.texts) this.videoEdits.texts = [];
            this.videoEdits.texts.push({ text, font: this.textState.font, color: this.textState.color });
        }
        this.closeTextEditor();
    }

    // --- CROP LOGIC ---
    toggleCropMode() {
        const overlay = document.getElementById('crop-editor-overlay');
        overlay.style.display = overlay.style.display === 'none' ? 'block' : 'none';
        
        if (overlay.style.display === 'block' && !this.cropInitialized) {
            this.cropInitialized = true;
            const box = document.getElementById('crop-box');
            let isDragging = false, currentHandle = null;
            let startX, startY, startLeft, startTop, startWidth, startHeight;
            
            const startDrag = (e) => {
                isDragging = true;
                currentHandle = e.target.dataset.corner || 'move';
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                startX = clientX; startY = clientY;
                startLeft = box.offsetLeft; startTop = box.offsetTop;
                startWidth = box.offsetWidth; startHeight = box.offsetHeight;
                e.stopPropagation();
            };
            
            const onDrag = (e) => {
                if (!isDragging) return;
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                const dx = clientX - startX; const dy = clientY - startY;
                
                if (currentHandle === 'move') {
                    box.style.left = startLeft + dx + 'px';
                    box.style.top = startTop + dy + 'px';
                } else if (currentHandle === 'br') {
                    box.style.width = startWidth + dx + 'px';
                    box.style.height = startHeight + dy + 'px';
                } else if (currentHandle === 'tl') {
                    box.style.width = startWidth - dx + 'px';
                    box.style.height = startHeight - dy + 'px';
                    box.style.left = startLeft + dx + 'px';
                    box.style.top = startTop + dy + 'px';
                }
                // (Omitted other corners for brevity, they function similarly)
            };
            
            const endDrag = () => { isDragging = false; };
            
            box.addEventListener('mousedown', startDrag);
            box.addEventListener('touchstart', startDrag, {passive: true});
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('touchmove', onDrag, {passive: true});
            document.addEventListener('mouseup', endDrag);
            document.addEventListener('touchend', endDrag);
        }
    }

    applyCrop() {
        document.getElementById('crop-editor-overlay').style.display = 'none';
        const box = document.getElementById('crop-box');
        const video = document.getElementById('gallery-preview-video');
        
        // Calculate crop percentage relative to the screen
        const container = video.parentElement;
        const cw = container.offsetWidth;
        const ch = container.offsetHeight;
        
        const scaleX = cw / box.offsetWidth;
        const scaleY = ch / box.offsetHeight;
        const scale = Math.min(scaleX, scaleY); // Keep aspect ratio
        
        // Calculate translation to center the cropped area
        const boxCenterX = box.offsetLeft + (box.offsetWidth / 2);
        const boxCenterY = box.offsetTop + (box.offsetHeight / 2);
        const transX = (cw / 2) - boxCenterX;
        const transY = (ch / 2) - boxCenterY;
        
        video.style.transform = `translate(${transX * scale}px, ${transY * scale}px) scale(${scale})`;
        
        // Save for upload
        if (!this.videoEdits) this.videoEdits = {};
        this.videoEdits.crop = { scale, transX, transY };
        
        const toast = document.getElementById('simulated-edit-toast');
        if (toast) {
            toast.textContent = 'Crop Applied';
            toast.style.display = 'block';
            toast.style.opacity = '1';
            setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.style.display='none', 300); }, 1500);
        }
    }

    cancelUpload() {
        this.recordedBlob = null;
        const preview = document.getElementById('gallery-preview-video');
        if (preview) preview.src = '';
        
        const fileInput = document.getElementById('gallery-file-input');
        if (fileInput) fileInput.value = '';
        
        const postForm = document.getElementById('upload-post-form');
        if (postForm) postForm.style.display = 'none';
        
        // Go back to home view instead of camera
        this.switchTab('home-view');
    }

    async uploadVideo() {
        if (!this.recordedBlob) return;
        
        // Guarantee profile exists so foreign key doesn't fail
        const profileError = await this.ensureProfileExists();
        if (profileError) {
            alert("Database Error: Could not verify your Profile.\n\nDetails: " + profileError.message);
            return;
        }

        const caption = (document.getElementById('upload-caption-input')?.value || '').trim() || 'New Simulizi!';
        const btn = document.getElementById('btn-post-now');
        if (btn) { btn.textContent = 'Posting...'; btn.disabled = true; }

        // Show progress bar
        const progressWrap = document.getElementById('upload-progress-bar-wrap');
        const progressBar = document.getElementById('upload-progress-bar');
        const progressText = document.getElementById('upload-progress-text');
        if (progressWrap) progressWrap.style.display = 'block';

        const ext = this.recordedBlob.type.includes('webm') ? 'webm' : 'mp4';
        const fileName = `${this.state.user.id}-${Date.now()}.${ext}`;

        // Simulate progress while uploading
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress = Math.min(progress + 10, 85);
            if (progressBar) progressBar.style.width = progress + '%';
        }, 300);

        // 1. Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabaseClient
            .storage
            .from('videos')
            .upload(fileName, this.recordedBlob, { contentType: this.recordedBlob.type });

        clearInterval(progressInterval);

        if (uploadError) {
            if (progressText) progressText.textContent = 'Upload failed: ' + uploadError.message;
            if (btn) { btn.textContent = 'Post'; btn.disabled = false; }
            alert('Upload failed: ' + uploadError.message);
            return;
        }

        if (progressBar) progressBar.style.width = '95%';

        // 2. Get public URL
        const { data: publicUrlData } = supabaseClient
            .storage
            .from('videos')
            .getPublicUrl(fileName);

        const videoUrl = publicUrlData.publicUrl;

        // 3. Insert into videos table
        const { error: insertError } = await supabaseClient
            .from('videos')
            .insert({
                user_id: this.state.user.id,
                video_url: videoUrl,
                caption: caption,
                price: 0,
                is_premium: false,
                edits: this.videoEdits || {}
            });

        if (progressBar) progressBar.style.width = '100%';

        if (insertError) {
            if (progressText) progressText.textContent = 'Failed to save post: ' + insertError.message;
            if (btn) { btn.textContent = 'Post'; btn.disabled = false; }
            alert('Failed to save post: ' + insertError.message);
        } else {
            // Reset everything and go home
            this.recordedBlob = null;
            document.getElementById('gallery-file-input').value = '';
            document.getElementById('upload-caption-input').value = '';
            if (btn) { btn.textContent = 'Post'; btn.disabled = false; }
            await this.renderFeed();
            this.switchTab('home-view');
        }
    }


    // --- INBOX & PROFILE INTERACTIVITY ---
    setupInboxInteractions() {
        document.querySelectorAll('.follow-back-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const b = e.target;
                if(b.classList.contains('following')) {
                    b.classList.remove('following');
                    b.textContent = "Follow back";
                } else {
                    b.classList.add('following');
                    b.textContent = "Following";
                }
            });
        });
    }

    setupProfileTabs() {
        // Add logout button if not exists
        const header = document.querySelector('.profile-header-2024');
        if (!document.getElementById('logout-btn')) {
            const logoutBtn = document.createElement('div');
            logoutBtn.id = 'logout-btn';
            logoutBtn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>';
            logoutBtn.style.cursor = 'pointer';
            logoutBtn.onclick = () => this.logout();
            header.appendChild(logoutBtn); // append to far right
        }

        const tabs = document.querySelectorAll('.ptab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
            });
        });
    }

    // --- ANALYTICS DASHBOARD ---
    async openAnalytics() {
        if (!this.state.isAuthenticated) return this.showAuthModal();
        const backdrop = document.getElementById('analytics-modal-backdrop');
        const modal = document.getElementById('analytics-modal');
        backdrop.classList.remove('hidden');
        modal.classList.remove('hidden');
        
        await this.loadAnalytics();
        
        // Setup realtime subscription for analytics
        this.analyticsSubscription = supabaseClient
            .channel('analytics-channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'videos', filter: `user_id=eq.${this.state.user.id}` }, () => this.loadAnalytics())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, () => this.loadAnalytics())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => this.loadAnalytics())
            .subscribe();
    }

    closeAnalytics() {
        document.getElementById('analytics-modal-backdrop').classList.add('hidden');
        document.getElementById('analytics-modal').classList.add('hidden');
        if (this.analyticsSubscription) {
            supabaseClient.removeChannel(this.analyticsSubscription);
            this.analyticsSubscription = null;
        }
    }

    async loadAnalytics() {
        if (!this.state.isAuthenticated) return;
        
        const listContainer = document.getElementById('analytics-videos-list');
        listContainer.innerHTML = '<div style="color:#888; text-align:center; padding:20px;">Loading live analytics...</div>';
        
        const { data: videos, error } = await supabaseClient
            .from('video_details')
            .select('*')
            .eq('author_id', this.state.user.id)
            .order('created_at', { ascending: false });
            
        if (error || !videos || videos.length === 0) {
            document.getElementById('analytics-total-views').textContent = 0;
            document.getElementById('analytics-total-likes').textContent = 0;
            document.getElementById('analytics-total-comments').textContent = 0;
            listContainer.innerHTML = '<div style="color:#888; text-align:center; padding:20px;">No videos yet.</div>';
            return;
        }
        
        let totalViews = 0;
        let totalLikes = 0;
        let totalComments = 0;
        
        listContainer.innerHTML = '';
        
        videos.forEach(v => {
            const views = v.view_count || 0;
            const likes = v.like_count || 0;
            const comments = v.comment_count || 0;
            
            totalViews += views;
            totalLikes += likes;
            totalComments += comments;
            
            listContainer.innerHTML += `
                <div class="analytics-video-row">
                    <div class="analytics-video-thumb">
                        <video src="${v.video_url}" style="width:100%; height:100%; object-fit:cover;"></video>
                    </div>
                    <div class="analytics-video-info">
                        <div class="analytics-video-caption">${v.caption || 'Untitled Video'}</div>
                        <div class="analytics-video-metrics">
                            <span class="analytics-metric"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg> ${views}</span>
                            <span class="analytics-metric"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg> ${likes}</span>
                            <span class="analytics-metric"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> ${comments}</span>
                        </div>
                    </div>
                </div>
            `;
        });
        
        document.getElementById('analytics-total-views').textContent = totalViews;
        document.getElementById('analytics-total-likes').textContent = totalLikes;
        document.getElementById('analytics-total-comments').textContent = totalComments;
    }
}

const app = new TikTokClone();
