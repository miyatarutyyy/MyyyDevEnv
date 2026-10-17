;;; appendix-overlay.el --- Sidecar appendix overlays -*- lexical-binding: t; -*-

(require 'org)
(require 'subr-x)
(require 'cl-lib)

;;; Appendix overlays

(defvar-local appendix-overlay--overlays nil)
(defvar-local appendix-overlay-mode nil)

(defun appendix-overlay-file-name (&optional source)
  "Return the appendix sidecar name for SOURCE, including its extension."
  (concat (or source buffer-file-name
              (user-error "Visit a source file before using its appendix"))
          "-appendix.org"))

(defun appendix-overlay--sidecar-after-save ()
  "Refresh the source buffer after its appendix sidecar is saved."
  (when (and buffer-file-name
             (string-suffix-p "-appendix.org" buffer-file-name))
    (let* ((source-file (string-remove-suffix "-appendix.org" buffer-file-name))
           (source-buffer (get-file-buffer source-file)))
      (when (buffer-live-p source-buffer)
        (with-current-buffer source-buffer
          (appendix-overlay-refresh))))))

(defun appendix-overlay--track-sidecar ()
  "Install automatic source refresh for an appendix sidecar buffer."
  (when (and buffer-file-name
             (string-suffix-p "-appendix.org" buffer-file-name))
    (add-hook 'after-save-hook #'appendix-overlay--sidecar-after-save nil t)))

(add-hook 'find-file-hook #'appendix-overlay--track-sidecar)

(defun appendix-overlay--records ()
  (let ((file (appendix-overlay-file-name)) records)
    (when (file-exists-p file)
      (with-current-buffer (find-file-noselect file)
        (add-hook 'after-save-hook #'appendix-overlay--sidecar-after-save nil t)
        (org-with-wide-buffer
         (org-map-entries
          (lambda ()
            (let* ((props (org-entry-properties nil))
                   (start (save-excursion
                            (org-back-to-heading t)
                            (org-end-of-meta-data t)
                            (point)))
                   (end (save-excursion (org-end-of-subtree t t)))
                   (body (string-trim
                          (buffer-substring-no-properties start end)))
                   (anchor (cdr (assoc "APPENDIX_ANCHOR" props)))
                   (id (cdr (assoc "APPENDIX_ID" props))))
              (when (and anchor (not (string-empty-p anchor))
                         (not (string-empty-p body)))
                (push (list :id id
                            :title (org-get-heading t t t t)
                            :anchor anchor
                            :type (or (cdr (assoc "APPENDIX_TYPE" props)) "note")
                            :placement (or (cdr (assoc "APPENDIX_PLACEMENT" props)) "after")
                            :body body)
                      records))))
          nil nil)))
    (nreverse records))))

(defun appendix-overlay--clear ()
  (mapc #'delete-overlay appendix-overlay--overlays)
  (setq appendix-overlay--overlays nil))

(defun appendix-overlay--anchor-position (anchor)
  (save-excursion
    (goto-char (point-min))
    (let (positions)
      (while (re-search-forward (concat "^" (regexp-quote anchor) "[ \t]*$") nil t)
        (push (if (equal (line-end-position) (point-max))
                  (point-max)
                (1+ (line-end-position)))
              positions))
      (when (= (length positions) 1) (car positions)))))

(defun appendix-overlay--render ()
  (appendix-overlay--clear)
  (when (and appendix-overlay-mode buffer-file-name)
    (dolist (record (appendix-overlay--records))
      (let ((position (appendix-overlay--anchor-position
                       (plist-get record :anchor))))
        (when position
          (let* ((type (upcase (plist-get record :type)))
                 (title (plist-get record :title))
                 (text (format "[%s] %s\n%s\n"
                               type title (plist-get record :body)))
                 (overlay (make-overlay position position)))
            (overlay-put overlay 'after-string
                         (propertize text 'face
                                     '(:background "#101010"
                                       :foreground "#d94f04"
                                       :extend t)))
            (overlay-put overlay 'appendix-overlay record)
            (push overlay appendix-overlay--overlays))))))
  (message "Appendix: displayed %d annotation(s)"
           (length appendix-overlay--overlays)))

(defun appendix-overlay-show ()
  "Display this source file's appendix entries as buffer-only overlays."
  (interactive)
  (unless buffer-file-name (user-error "Visit a source file first"))
  (setq appendix-overlay-mode t)
  (appendix-overlay--render))

(defun appendix-overlay-hide ()
  "Hide appendix overlays in the current buffer."
  (interactive)
  (setq appendix-overlay-mode nil)
  (appendix-overlay--clear)
  (message "Appendix overlays hidden"))

(defun appendix-overlay-refresh ()
  "Refresh appendix overlays from the sidecar file."
  (interactive)
  (if appendix-overlay-mode
      (appendix-overlay--render)
    (appendix-overlay-show)))

(add-hook 'after-change-functions
          (lambda (&rest _ignored)
            (when appendix-overlay-mode
              (appendix-overlay--render))))

;;; Editable composed view

(defvar-local appendix-overlay-view-source-file nil)
(defvar-local appendix-overlay-view-sidecar nil)
(defvar-local appendix-overlay-view-regions nil)

(defvar appendix-overlay-view-mode-map
  (let ((map (make-sparse-keymap)))
    (set-keymap-parent map global-map)
    (define-key map (kbd "C-x C-s") #'appendix-overlay-view-save)
    (define-key map (kbd "C-c C-c") #'appendix-overlay-view-save-and-quit)
    (define-key map (kbd "C-c C-k") #'appendix-overlay-view-quit)
    map))

;; Keep these bindings current when this file is reloaded in a live daemon.
(define-key appendix-overlay-view-mode-map (kbd "C-x C-s") #'appendix-overlay-view-save)
(define-key appendix-overlay-view-mode-map (kbd "C-c C-c") #'appendix-overlay-view-save-and-quit)
(define-key appendix-overlay-view-mode-map (kbd "C-c C-k") #'appendix-overlay-view-quit)

(define-derived-mode appendix-overlay-view-mode fundamental-mode "Appendix-View"
  "A composed view with read-only source and editable appendix notes.")

(define-key appendix-overlay-view-mode-map (kbd "C-c C-c") #'appendix-overlay-view-save-and-quit)
(define-key appendix-overlay-view-mode-map (kbd "C-c C-k") #'appendix-overlay-view-quit)
(define-key appendix-overlay-view-mode-map (kbd "q") #'self-insert-command)

(defun appendix-overlay-edit-view ()
  "Open a composed buffer where appendix notes can be edited inline."
  (interactive)
  (unless buffer-file-name (user-error "Visit a source file first"))
  (let* ((source-buffer (current-buffer))
         (source-file buffer-file-name)
         (sidecar (appendix-overlay-file-name source-file))
         (records (appendix-overlay--records))
         (source-text (buffer-substring (point-min) (point-max)))
         insertions)
    (unless (file-exists-p sidecar)
      (user-error "No appendix sidecar found: %s" sidecar))
    (with-current-buffer source-buffer
      (dolist (record records)
        (let ((position (appendix-overlay--anchor-position
                         (plist-get record :anchor))))
          (when position
            (unless (plist-get record :id)
              (user-error "Add an :APPENDIX_ID: property to %s"
                          (plist-get record :title)))
            (push (cons position record) insertions)))))
    (unless insertions
      (user-error "No appendix entries have a unique matching anchor"))
    (let ((view (generate-new-buffer
                 (format "*Appendix: %s*" (file-name-nondirectory source-file)))))
      (with-current-buffer view
        (appendix-overlay-view-mode)
        (setq-local appendix-overlay-view-source-file source-file
                    appendix-overlay-view-sidecar sidecar
                    default-directory (file-name-directory source-file))
        (let ((inhibit-read-only t))
          (insert source-text)
          (add-text-properties (point-min) (point-max) '(read-only t))
          (dolist (item (sort insertions (lambda (a b) (> (car a) (car b)))))
            (goto-char (car item))
            (let* ((record (cdr item))
                   (id (plist-get record :id))
                   (header-start (point)))
              (insert (format "[%s] %s\n"
                              (upcase (plist-get record :type))
                              (plist-get record :title)))
              (add-text-properties
               header-start (point)
               '(read-only t face (:background "#101010"
                                  :foreground "#d94f04" :extend t)))
              (let ((body-start (point)))
                (insert (plist-get record :body))
                (unless (bolp) (insert "\n"))
                (let ((body-end (point)))
                  (remove-text-properties body-start body-end '(read-only nil))
                  (add-text-properties body-start body-end
                                       (list 'appendix-overlay-id id
                                             'face '(:background "#101010"
                                             :foreground "#d94f04"
                                                     :extend t)))
                  (push (list id (copy-marker body-start)
                              (copy-marker body-end))
                        appendix-overlay-view-regions)))))
          (setq buffer-read-only nil
                buffer-offer-save nil)
          (set-buffer-modified-p nil)))
      (pop-to-buffer view)
      (message "Appendix view: edit note text here; C-x C-s saves only the appendix"))))

(defun appendix-overlay--replace-entry-body (id body)
  (let (found)
    (org-with-wide-buffer
     (org-map-entries
      (lambda ()
        (when (equal id (org-entry-get nil "APPENDIX_ID"))
          (let ((start (save-excursion
                         (org-back-to-heading t)
                         (org-end-of-meta-data t)
                         (point)))
                (end (save-excursion (org-end-of-subtree t t)))
                (inhibit-read-only t))
            (delete-region start end)
            (goto-char start)
            (insert body (unless (string-suffix-p "\n" body) "\n"))
            (setq found t))))
      nil nil))
    (unless found
      (user-error "Appendix entry %s no longer exists" id))))

(defun appendix-overlay-view-save ()
  "Save edited note regions to the appendix sidecar, never to the source."
  (interactive)
  (unless appendix-overlay-view-sidecar
    (user-error "This is not an appendix view buffer"))
  (let ((view-buffer (current-buffer))
        (sidecar-buffer (find-file-noselect appendix-overlay-view-sidecar)))
    (with-current-buffer sidecar-buffer
      (unless (derived-mode-p 'org-mode) (org-mode))
      (atomic-change-group
        (dolist (region (buffer-local-value 'appendix-overlay-view-regions
                                            view-buffer))
          (let* ((id (nth 0 region))
                 (start (marker-position (nth 1 region)))
                 (end (marker-position (nth 2 region)))
                 (body (with-current-buffer view-buffer
                         (string-trim-right
                          (buffer-substring-no-properties start end)))))
            (appendix-overlay--replace-entry-body id body))))
      (save-buffer))
    (with-current-buffer view-buffer
      (set-buffer-modified-p nil)
      (message "Appendix saved to %s; source file unchanged"
               appendix-overlay-view-sidecar))))

(defun appendix-overlay-view-quit ()
  "Close the appendix view, asking before discarding unsaved note edits."
  (interactive)
  (when (or (not (buffer-modified-p))
            (yes-or-no-p "Discard unsaved appendix edits and close this view? "))
    (quit-window)))

(defun appendix-overlay-view-save-and-quit ()
  "Save appendix edits and close the composed view."
  (interactive)
  (appendix-overlay-view-save)
  (quit-window))

(provide 'appendix-overlay)
;;; appendix-overlay.el ends here
