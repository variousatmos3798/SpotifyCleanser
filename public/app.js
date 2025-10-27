class SpotifyCleanser {
    constructor() {
        this.accessToken = null;
        this.playlists = [];
        this.selectedPlaylists = new Set();
        this.duplicates = {};
        this.init();
    }

    init() {
        this.checkAuth();
        this.attachEventListeners();
    }

    checkAuth() {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const error = params.get('error');

        if (error) {
            alert('Authentication error. Please try again.');
            return;
        }

        if (accessToken) {
            this.accessToken = accessToken;
            window.location.hash = '';
            this.loadPlaylists();
        }
    }

    attachEventListeners() {
        document.getElementById('login-btn').addEventListener('click', () => {
            window.location.href = '/login';
        });

        document.getElementById('playlist-search').addEventListener('input', (e) => {
            this.filterPlaylists(e.target.value);
        });

        document.getElementById('select-all-playlists').addEventListener('change', (e) => {
            this.toggleSelectAll(e.target.checked);
        });

        document.getElementById('find-duplicates-btn').addEventListener('click', () => {
            this.findDuplicates();
        });

        document.getElementById('remove-duplicates-btn').addEventListener('click', () => {
            this.removeDuplicates();
        });

        document.getElementById('back-to-playlists-btn').addEventListener('click', () => {
            this.showSection('playlists-section');
        });

        document.getElementById('start-over-btn').addEventListener('click', () => {
            this.selectedPlaylists.clear();
            this.duplicates = {};
            this.loadPlaylists();
        });

        document.getElementById('consolidate-checkbox').addEventListener('change', (e) => {
            const nameInput = document.getElementById('consolidate-name-input');
            if (e.target.checked) {
                nameInput.classList.remove('hidden');
            } else {
                nameInput.classList.add('hidden');
            }
        });
    }

    async loadPlaylists() {
        this.showLoading('Loading your playlists...');

        try {
            const response = await fetch('/api/playlists', {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch playlists');

            this.playlists = await response.json();
            this.renderPlaylists();
            this.showSection('playlists-section');
        } catch (error) {
            console.error('Error loading playlists:', error);
            alert('Failed to load playlists. Please try logging in again.');
            this.showSection('login-section');
        } finally {
            this.hideLoading();
        }
    }

    renderPlaylists(filter = '') {
        const playlistsList = document.getElementById('playlists-list');
        playlistsList.innerHTML = '';

        const filteredPlaylists = this.playlists.filter(playlist =>
            playlist.name.toLowerCase().includes(filter.toLowerCase())
        );

        if (filteredPlaylists.length === 0) {
            playlistsList.innerHTML = `
                <div class="empty-state">
                    <h3>No playlists found</h3>
                    <p>Try adjusting your search</p>
                </div>
            `;
            return;
        }

        filteredPlaylists.forEach(playlist => {
            const item = document.createElement('div');
            item.className = 'playlist-item';
            item.innerHTML = `
                <input type="checkbox"
                       id="playlist-${playlist.id}"
                       ${this.selectedPlaylists.has(playlist.id) ? 'checked' : ''}>
                <div class="playlist-info">
                    <div class="playlist-name">${this.escapeHtml(playlist.name)}</div>
                    <div class="playlist-tracks">${playlist.tracks.total} tracks</div>
                </div>
            `;

            const checkbox = item.querySelector('input[type="checkbox"]');
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.selectedPlaylists.add(playlist.id);
                } else {
                    this.selectedPlaylists.delete(playlist.id);
                }
                this.updateFindDuplicatesButton();
                this.updateSelectAllCheckbox();
                this.updateSelectedCount();
            });

            item.addEventListener('click', (e) => {
                if (e.target.type !== 'checkbox') {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                }
            });

            playlistsList.appendChild(item);
        });

        this.updateSelectAllCheckbox();
        this.updateSelectedCount();
    }

    filterPlaylists(filter) {
        this.renderPlaylists(filter);
    }

    toggleSelectAll(checked) {
        const checkboxes = document.querySelectorAll('.playlist-item input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = checked;
            const playlistId = checkbox.id.replace('playlist-', '');
            if (checked) {
                this.selectedPlaylists.add(playlistId);
            } else {
                this.selectedPlaylists.delete(playlistId);
            }
        });
        this.updateFindDuplicatesButton();
        this.updateSelectedCount();
    }

    updateSelectAllCheckbox() {
        const selectAllCheckbox = document.getElementById('select-all-playlists');
        const visibleCheckboxes = document.querySelectorAll('.playlist-item input[type="checkbox"]');
        const checkedCount = Array.from(visibleCheckboxes).filter(cb => cb.checked).length;

        selectAllCheckbox.checked = visibleCheckboxes.length > 0 &&
                                     checkedCount === visibleCheckboxes.length;
        selectAllCheckbox.indeterminate = checkedCount > 0 &&
                                          checkedCount < visibleCheckboxes.length;
    }

    updateFindDuplicatesButton() {
        const button = document.getElementById('find-duplicates-btn');
        button.disabled = this.selectedPlaylists.size === 0;
    }

    updateSelectedCount() {
        const count = this.selectedPlaylists.size;
        const countElement = document.getElementById('selected-count');
        countElement.textContent = `${count} selected`;
    }

    async findDuplicates() {
        this.showLoading('Scanning playlists for duplicates...');

        try {
            const response = await fetch('/api/find-duplicates', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    playlistIds: Array.from(this.selectedPlaylists)
                })
            });

            if (!response.ok) throw new Error('Failed to find duplicates');

            this.duplicates = await response.json();
            this.renderDuplicates();
            this.showSection('duplicates-section');
        } catch (error) {
            console.error('Error finding duplicates:', error);
            alert('Failed to find duplicates. Please try again.');
        } finally {
            this.hideLoading();
        }
    }

    renderDuplicates() {
        const duplicatesList = document.getElementById('duplicates-list');
        const summary = document.getElementById('duplicates-summary');

        const playlistCount = Object.keys(this.duplicates).length;
        const totalDuplicates = Object.values(this.duplicates).reduce(
            (sum, dups) => sum + dups.length, 0
        );

        if (totalDuplicates === 0) {
            summary.innerHTML = `
                <div class="empty-state">
                    <h3>No duplicates found!</h3>
                    <p>Your selected playlists are clean.</p>
                </div>
            `;
            duplicatesList.innerHTML = '';
            document.getElementById('remove-duplicates-btn').style.display = 'none';
            return;
        }

        summary.innerHTML = `
            <p><strong>Found ${totalDuplicates} duplicate track${totalDuplicates !== 1 ? 's' : ''}</strong>
               across ${playlistCount} playlist${playlistCount !== 1 ? 's' : ''}.</p>
            <p>Click "Remove All Duplicates" to clean your playlists.</p>
        `;

        duplicatesList.innerHTML = '';

        for (const [playlistId, dups] of Object.entries(this.duplicates)) {
            const playlist = this.playlists.find(p => p.id === playlistId);
            if (!playlist) continue;

            const playlistDiv = document.createElement('div');
            playlistDiv.className = 'playlist-duplicates';

            playlistDiv.innerHTML = `
                <h3>
                    ${this.escapeHtml(playlist.name)}
                    <span class="duplicate-count">${dups.length} duplicate${dups.length !== 1 ? 's' : ''}</span>
                </h3>
                <div class="duplicates-items">
                    ${dups.map(dup => `
                        <div class="duplicate-item">
                            <div class="duplicate-track-name">${this.escapeHtml(dup.trackName)}</div>
                            <div class="duplicate-artist">${this.escapeHtml(dup.artists)}</div>
                        </div>
                    `).join('')}
                </div>
            `;

            duplicatesList.appendChild(playlistDiv);
        }

        document.getElementById('remove-duplicates-btn').style.display = 'inline-block';
    }

    async removeDuplicates() {
        const shouldConsolidate = document.getElementById('consolidate-checkbox').checked;

        let confirmMessage = 'Are you sure you want to remove all duplicate tracks? This action cannot be undone.';
        if (shouldConsolidate) {
            confirmMessage += '\n\nA new consolidated playlist will also be created with all unique songs.';
        }

        if (!confirm(confirmMessage)) {
            return;
        }

        this.showLoading('Removing duplicates...');

        try {
            let totalRemoved = 0;
            let successMessage = '';

            // Remove duplicates
            for (const [playlistId, dups] of Object.entries(this.duplicates)) {
                const response = await fetch('/api/remove-duplicates', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        playlistId: playlistId,
                        duplicates: dups
                    })
                });

                if (!response.ok) throw new Error('Failed to remove duplicates');

                const result = await response.json();
                totalRemoved += result.removedCount;
            }

            successMessage = `Successfully removed ${totalRemoved} duplicate track${totalRemoved !== 1 ? 's' : ''} from your playlists!`;

            // Consolidate if requested
            if (shouldConsolidate) {
                this.showLoading('Creating consolidated playlist...');

                const playlistName = document.getElementById('new-playlist-name').value || 'Cleanser - Consolidated';
                const playlistIds = Array.from(this.selectedPlaylists);

                const response = await fetch('/api/consolidate-playlists', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        playlistIds: playlistIds,
                        newPlaylistName: playlistName
                    })
                });

                if (!response.ok) throw new Error('Failed to consolidate playlists');

                const result = await response.json();
                successMessage += `\n\nCreated new playlist "${playlistName}" with ${result.trackCount} unique songs!`;
            }

            document.getElementById('success-text').textContent = successMessage;
            this.showSection('success-section');
        } catch (error) {
            console.error('Error processing playlists:', error);
            alert('Failed to complete the operation. Please try again.');
        } finally {
            this.hideLoading();
        }
    }

    showSection(sectionId) {
        document.querySelectorAll('.section').forEach(section => {
            section.classList.add('hidden');
        });
        document.getElementById(sectionId).classList.remove('hidden');
    }

    showLoading(text) {
        document.getElementById('loading-text').textContent = text;
        document.getElementById('loading').classList.remove('hidden');
    }

    hideLoading() {
        document.getElementById('loading').classList.add('hidden');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SpotifyCleanser();
});
