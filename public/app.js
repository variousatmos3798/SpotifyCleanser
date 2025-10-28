class SpotifyCleanser {
    constructor() {
        this.accessToken = null;
        this.playlists = [];
        this.selectedPlaylists = new Set();
        this.duplicates = {};
        this.audioFilters = null;
        this.activePreset = null;
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

        // Audio filter preset buttons
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const preset = e.target.dataset.preset;
                this.applyPreset(preset);
            });
        });
    }

    applyPreset(preset) {
        // Remove active class from all buttons
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        const filterDetails = document.getElementById('filter-details');
        const filterInfo = filterDetails.querySelector('.filter-info');

        switch(preset) {
            case 'intense':
                // High energy + fast tempo = intense workout
                this.audioFilters = {
                    minEnergy: 0.7,
                    minTempo: 120
                };
                this.activePreset = 'intense';
                document.querySelector('[data-preset="intense"]').classList.add('active');
                filterInfo.textContent = 'Filters: High Energy (>0.7) + Fast Tempo (>120 BPM) - Perfect for intense workouts!';
                filterDetails.classList.remove('hidden');
                break;

            case 'aggressive':
                // High energy + low valence + high loudness = aggressive/angry
                this.audioFilters = {
                    minEnergy: 0.65,
                    maxValence: 0.4
                };
                this.activePreset = 'aggressive';
                document.querySelector('[data-preset="aggressive"]').classList.add('active');
                filterInfo.textContent = 'Filters: High Energy (>0.65) + Low Mood (<0.4) - Angry/aggressive vibes!';
                filterDetails.classList.remove('hidden');
                break;

            case 'upbeat':
                // High energy + high valence = happy/upbeat
                this.audioFilters = {
                    minEnergy: 0.6,
                    minValence: 0.6
                };
                this.activePreset = 'upbeat';
                document.querySelector('[data-preset="upbeat"]').classList.add('active');
                filterInfo.textContent = 'Filters: High Energy (>0.6) + Happy Mood (>0.6) - Upbeat and positive!';
                filterDetails.classList.remove('hidden');
                break;

            case 'chill':
                // Low energy = chill
                this.audioFilters = {
                    maxEnergy: 0.5,
                    minValence: 0.3
                };
                this.activePreset = 'chill';
                document.querySelector('[data-preset="chill"]').classList.add('active');
                filterInfo.textContent = 'Filters: Low Energy (<0.5) - Chill and relaxed vibes!';
                filterDetails.classList.remove('hidden');
                break;

            case 'clear':
                this.audioFilters = null;
                this.activePreset = null;
                filterDetails.classList.add('hidden');
                break;
        }
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
        this.showLoading('Analyzing playlists...');

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

            if (!response.ok) throw new Error('Failed to analyze playlists');

            const data = await response.json();
            this.duplicates = data.duplicates || {};
            this.statistics = data.statistics || {};
            this.renderDuplicates();
            this.showSection('duplicates-section');
        } catch (error) {
            console.error('Error analyzing playlists:', error);
            alert('Failed to analyze playlists. Please try again.');
        } finally {
            this.hideLoading();
        }
    }

    renderDuplicates() {
        const duplicatesList = document.getElementById('duplicates-list');
        const summary = document.getElementById('duplicates-summary');
        const stats = this.statistics || {};

        // Show cross-playlist statistics
        const totalUnique = stats.totalUniqueTracks || 0;
        const totalTracks = stats.totalTracks || 0;
        const crossPlaylistDups = stats.crossPlaylistDuplicates || 0;
        const duplicateSongs = stats.duplicateSongs || [];

        summary.innerHTML = `
            <p><strong>Analysis Results:</strong></p>
            <p><strong>${totalUnique}</strong> unique songs across <strong>${this.selectedPlaylists.size}</strong> playlists</p>
            <p><strong>${totalTracks}</strong> total song instances</p>
            <p><strong>${crossPlaylistDups}</strong> songs appear in multiple playlists</p>
            <p style="margin-top: 15px; color: #1db954;">Use the consolidation option below to combine all unique songs into one playlist!</p>
        `;

        duplicatesList.innerHTML = '';

        if (duplicateSongs.length > 0) {
            const topDupsDiv = document.createElement('div');
            topDupsDiv.className = 'playlist-duplicates';
            topDupsDiv.innerHTML = `
                <h3>Top Songs Appearing in Multiple Playlists</h3>
                <div class="duplicates-items">
                    ${duplicateSongs.map(dup => `
                        <div class="duplicate-item">
                            <div class="duplicate-track-name">${this.escapeHtml(dup.trackName)}</div>
                            <div class="duplicate-artist">${this.escapeHtml(dup.artists)}</div>
                            <div style="font-size: 0.85em; color: #666; margin-top: 5px;">
                                Appears in ${dup.occurrenceCount} playlists: ${dup.appearsIn.slice(0, 3).map(p => this.escapeHtml(p)).join(', ')}${dup.appearsIn.length > 3 ? '...' : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
            duplicatesList.appendChild(topDupsDiv);
        }

        document.getElementById('remove-duplicates-btn').style.display = 'inline-block';
    }

    async removeDuplicates() {
        const shouldConsolidate = document.getElementById('consolidate-checkbox').checked;
        const shouldDelete = document.getElementById('delete-originals-checkbox').checked;

        if (!shouldConsolidate) {
            alert('Please check the "Create Consolidated Playlist" option to proceed.');
            return;
        }

        let confirmMessage = `This will create a new consolidated playlist with all unique songs from your ${this.selectedPlaylists.size} selected playlists.`;
        if (shouldDelete) {
            confirmMessage += '\n\nWARNING: The original playlists will be DELETED. This cannot be undone!';
        }
        confirmMessage += '\n\nDo you want to continue?';

        if (!confirm(confirmMessage)) {
            return;
        }

        this.showLoading('Creating consolidated playlist...');

        try {
            let successMessage = '';
            const playlistName = document.getElementById('new-playlist-name').value || 'Cleanser - Consolidated';
            const playlistIds = Array.from(this.selectedPlaylists);

            // Create consolidated playlist
            const requestBody = {
                playlistIds: playlistIds,
                newPlaylistName: playlistName
            };

            // Add audio filters if applied
            if (this.audioFilters) {
                requestBody.audioFilters = this.audioFilters;
            }

            const response = await fetch('/api/consolidate-playlists', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) throw new Error('Failed to consolidate playlists');

            const result = await response.json();

            if (result.filtersApplied) {
                successMessage = `Created new playlist "${playlistName}" with ${result.trackCount} songs (filtered from ${result.totalTracksAnalyzed} total)!`;
            } else {
                successMessage = `Created new playlist "${playlistName}" with ${result.trackCount} unique songs!`;
            }

            // Delete original playlists if requested
            if (shouldDelete) {
                this.showLoading('Deleting original playlists...');

                const deleteResponse = await fetch('/api/delete-playlists', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        playlistIds: playlistIds
                    })
                });

                if (deleteResponse.ok) {
                    const deleteResult = await deleteResponse.json();
                    successMessage += `\n\nDeleted ${deleteResult.deletedCount} original playlists.`;
                } else {
                    successMessage += `\n\nWarning: Some playlists could not be deleted.`;
                }
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
