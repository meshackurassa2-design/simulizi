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

            this.renderFeed();
            this.setupIntersectionObserver();
            this.setupInboxInteractions();
            this.setupProfileTabs();
            this.updateInboxUI();
        } catch (err) {
            document.body.innerHTML = `<div style="padding:20px; color:red; background:white; position:fixed; z-index:9999; top:0; left:0; right:0;"><h3>App Error</h3><pre>${err.message}</pre><pre>${err.stack}</pre></div>` + document.body.innerHTML;
        }
    }

    async ensureProfileExists() {
        if (!this.state.user) return null;
        const { data, error: selectError } = await supabaseClient.from('profiles').select('id').eq('id', this.state.user.id).single();
        if (!data) {
            const handle = this.state.user.user_metadata?.username || this.state.user.email.split('@')[0];
            const { error: insertError } = await supabaseClient.from('profiles').insert({
                id: this.state.user.id,
                username: handle
            });
            if (insertError) {
                console.error("Profile insert failed:", insertError);
                return insertError;
            }
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
                item.innerHTML = `<video src="${video.video_url}#t=0.1" style="width:100%; height:100%; object-fit:cover;" preload="metadata" muted></video>`;
                profileGrid.appendChild(item);
            });
        }
    }

    openEditProfileModal() {
        document.getElementById('edit-profile-modal').classList.remove('hidden');
        document.getElementById('edit-username').value = this.state.user?.user_metadata?.username || '';
        document.getElementById('edit-profile-error').classList.add('hidden');
    }

    closeEditProfileModal() {
        document.getElementById('edit-profile-modal').classList.add('hidden');
    }

    async saveProfile() {
        const username = document.getElementById('edit-username').value.trim();
        const errorDiv = document.getElementById('edit-profile-error');
        if (!username) {
            errorDiv.textContent = 'Username cannot be empty';
            errorDiv.classList.remove('hidden');
            return;
        }
        
        const btn = document.getElementById('btn-save-profile');
        btn.textContent = 'Saving...';
        btn.disabled = true;
        
        const { data, error } = await supabaseClient.auth.updateUser({
            data: { username: username }
        });
        
        if (error) {
            errorDiv.textContent = error.message;
            errorDiv.classList.remove('hidden');
        } else {
            this.state.user = data.user;
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
        const container = document.getElementById('feed-container');
        const template = document.getElementById('media-template');
        container.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100%;"><div class="record-spin" style="border-top-color:#fff;"></div></div>';

        let query = supabaseClient.from('video_details').select('*').order('created_at', { ascending: false });

        if (this.state.feedType === 'following') {
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

        if (error || !videos || videos.length === 0) {
            container.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100%; color:white; padding:40px; text-align:center;">No videos yet! Be the first to upload.</div>';
            return;
        }

        videos.forEach(media => {
            const clone = template.content.cloneNode(true);
            const mediaItem = clone.querySelector('.media-item');
            const video = clone.querySelector('.media-video');
            
            video.src = media.video_url;
            
            mediaItem.querySelector('.author-name').textContent = `@${media.author_username || 'user'}`;
            mediaItem.querySelector('.caption').innerHTML = (media.caption || '').replace(/#(\w+)/g, '<span class="tag">#$1</span>');
            mediaItem.querySelector('.likes-count').textContent = media.like_count || 0;
            mediaItem.querySelector('.comments-count').textContent = 0; // Not implemented yet
            mediaItem.querySelector('.marquee-content').textContent = `Original Sound - @${media.author_username || 'user'}`;

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
                            heartIcon.classList.add('liked');
                        }
                    });
            }

            likeBtn.addEventListener('click', async () => {
                if (!this.state.isAuthenticated) return this.showAuthModal();
                
                liked = !liked;
                
                if (liked) {
                    heartIcon.classList.add('liked');
                    baseLikes++;
                    likesCount.textContent = baseLikes;
                    await supabaseClient.from('likes').insert([{ video_id: media.id, user_id: this.state.user.id }]);
                } else {
                    heartIcon.classList.remove('liked');
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
        });
    }

    openCommentsSheet(media) {
        document.getElementById('comments-sheet').classList.remove('hidden');
        document.getElementById('comments-list').innerHTML = '<div style="padding: 20px; text-align: center; color: #888; font-size: 14px;">No comments yet. Be the first to comment!</div>';
        this.currentMediaForComment = media;
    }

    closeCommentsSheet() {
        document.getElementById('comments-sheet').classList.add('hidden');
    }

    postComment() {
        if (!this.state.isAuthenticated) return this.showAuthModal();
        const input = document.getElementById('new-comment-input');
        const text = input.value.trim();
        if (!text) return;

        const list = document.getElementById('comments-list');
        if (list.innerHTML.includes('No comments yet')) list.innerHTML = '';
        
        const username = this.state.user.user_metadata?.username || this.state.user.email.split('@')[0];
        
        const commentDiv = document.createElement('div');
        commentDiv.style.padding = '10px 0';
        commentDiv.innerHTML = `<strong style="font-size:13px; color:#555;">@${username}</strong><div style="font-size:14px; margin-top:4px;">${text}</div>`;
        
        list.appendChild(commentDiv);
        input.value = '';
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
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const video = entry.target.querySelector('.media-video');
                const paywall = entry.target.querySelector('.paywall-glass');
                const recordSpin = entry.target.querySelector('.record-spin');
                const playPauseInd = entry.target.querySelector('.play-pause-indicator');

                if (entry.isIntersecting) {
                    // Try to play if no paywall
                    if (paywall.classList.contains('hidden')) {
                        video.play().catch(e => console.log("Autoplay prevented"));
                        recordSpin.classList.remove('paused');
                        playPauseInd.classList.remove('show');
                    }
                } else {
                    video.pause();
                    video.currentTime = 0; // reset
                    recordSpin.classList.add('paused');
                }
            });
        }, options);

        document.querySelectorAll('.media-item').forEach(item => observer.observe(item));
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
        const textOverlay = document.getElementById('simulated-text-overlay');
        const cropOverlay = document.getElementById('simulated-crop-overlay');
        const preview = document.getElementById('gallery-preview-video');
        
        if (!toast) return;
        toast.style.display = 'block';
        toast.style.opacity = '1';
        
        if (action === 'trim') {
            toast.textContent = 'Simulating Trim...';
        } else if (action === 'text') {
            if (textOverlay.style.display === 'none') {
                textOverlay.style.display = 'block';
                toast.textContent = 'Text Added! (Drag to move)';
            } else {
                textOverlay.style.display = 'none';
                toast.textContent = 'Text Removed';
            }
        } else if (action === 'stickers') {
            toast.textContent = 'Stickers feature coming soon!';
        } else if (action === 'filters') {
            toast.textContent = 'Cycling Filter...';
            if (!this.filterIdx) this.filterIdx = 0;
            const filters = ['none', 'grayscale(100%)', 'sepia(100%)', 'invert(100%)', 'hue-rotate(90deg)'];
            this.filterIdx = (this.filterIdx + 1) % filters.length;
            if (preview) preview.style.filter = filters[this.filterIdx];
        } else if (action === 'crop') {
            if (cropOverlay.style.display === 'none') {
                cropOverlay.style.display = 'block';
                toast.textContent = 'Crop Mode Active';
            } else {
                cropOverlay.style.display = 'none';
                toast.textContent = 'Crop Applied';
            }
        }

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => { toast.style.display = 'none'; }, 300);
        }, 1500);
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
                is_premium: false
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
}

const app = new TikTokClone();
