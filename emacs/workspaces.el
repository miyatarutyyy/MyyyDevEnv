;;; workspaces.el --- Per-tab virtual Emacs clients -*- lexical-binding: t; -*-

(require 'desktop)
(require 'tab-bar)
(require 'seq)
(require 'subr-x)
(require 'ghostel)
(require 'ghostel-desktop)
(require 'memorandum)

(defvar tarutyyyne-workspace--frame-layouts (make-hash-table :test #'eq :weakness 'key)
  "Canonical window configuration for each frame.")

(defvar-local tarutyyyne-workspace--herdr-start-scheduled nil)
(defvar-local tarutyyyne-workspace--herdr-started nil)
(defvar tarutyyyne-workspace--fresh-frame nil
  "Non-nil while initializing a newly created Emacsclient frame.")

(defconst tarutyyyne-workspace--id-key 'tarutyyyne-workspace-id)
(defconst tarutyyyne-workspace--main-key 'tarutyyyne-workspace-main-buffer)
(defconst tarutyyyne-workspace--main-file-key 'tarutyyyne-workspace-main-file)
(defconst tarutyyyne-workspace--ghostel-key 'tarutyyyne-workspace-ghostel-buffer)
(defconst tarutyyyne-workspace--session-key 'tarutyyyne-workspace-herdr-session)
(defconst tarutyyyne-workspace--shared-herdr-session "default"
  "Existing Herdr session shared by every virtual Emacs client.")

(setq desktop-restore-frames t
      desktop-save t
      tab-bar-new-tab-choice 'clone)
(desktop-save-mode 1)
(tab-bar-mode 1)

(defun tarutyyyne-workspace--current-tab (&optional frame)
  "Return the current tab on FRAME."
  (assq 'current-tab (tab-bar-tabs frame)))

(defun tarutyyyne-workspace--new-id ()
  "Return a unique identifier for a new virtual client."
  (substring
   (secure-hash 'sha256
                (format "%s:%s:%s" (emacs-pid) (float-time) (random)))
   0 16))

(defun tarutyyyne-workspace--set-tab-parameter (tab key value)
  "Set KEY to VALUE in TAB while preserving the tab object identity."
  (let ((entry (assq key tab)))
    (if entry
        (setcdr entry value)
      (setcdr tab (cons (cons key value) (cdr tab)))))
  value)

(defun tarutyyyne-workspace--initialize-tab (tab &optional initial)
  "Ensure TAB has persistent virtual-client metadata.
All virtual clients attach to the shared existing Herdr session.
INITIAL selects the legacy buffer names for the first tab."
  (let* ((id (or (alist-get tarutyyyne-workspace--id-key tab)
                 (tarutyyyne-workspace--new-id)))
         (session tarutyyyne-workspace--shared-herdr-session)
         (main-name (or (alist-get tarutyyyne-workspace--main-key tab)
                        (if initial "*Main*"
                          (format "*Main: %s*" id))))
         (ghostel-name (or (alist-get tarutyyyne-workspace--ghostel-key tab)
                           (if initial "*AI Agent*"
                             (format "*Herdr: %s*" id)))))
    (tarutyyyne-workspace--set-tab-parameter
     tab tarutyyyne-workspace--id-key id)
    (tarutyyyne-workspace--set-tab-parameter
     tab tarutyyyne-workspace--session-key session)
    (tarutyyyne-workspace--set-tab-parameter
     tab tarutyyyne-workspace--main-key main-name)
    (tarutyyyne-workspace--set-tab-parameter
     tab tarutyyyne-workspace--main-file-key
     (alist-get tarutyyyne-workspace--main-file-key tab))
    (tarutyyyne-workspace--set-tab-parameter
     tab tarutyyyne-workspace--ghostel-key ghostel-name)
    ;; Persist custom tab parameters in the frame-local tab list.
    (tab-bar-tabs-set (tab-bar-tabs))
    (list id session main-name ghostel-name)))

(defun tarutyyyne-workspace--herdr-command (session)
  "Return a shell command to attach to existing SESSION."
  (format "herdr session attach %s" (shell-quote-argument session)))

(defun tarutyyyne-workspace--send-herdr (buffer session)
  "Start a separate Ghostel client attached to existing Herdr SESSION."
  (when (buffer-live-p buffer)
    (with-current-buffer buffer
      (unless (or tarutyyyne-workspace--herdr-started
                  tarutyyyne-workspace--herdr-start-scheduled)
        (setq tarutyyyne-workspace--herdr-start-scheduled t)
        (run-at-time
         1 nil
         (lambda (terminal session-name)
           (when (buffer-live-p terminal)
             (with-current-buffer terminal
               (setq tarutyyyne-workspace--herdr-start-scheduled nil)
               (when (and (get-buffer-process terminal)
                          (process-live-p (get-buffer-process terminal)))
                 (ghostel-send-string
                  (concat (tarutyyyne-workspace--herdr-command session-name)
                          "\n"))
                 (setq tarutyyyne-workspace--herdr-started t)))))
         buffer session)))))

(defun tarutyyyne-workspace--restore-pending-ghostel (buffer-name)
  "Eagerly restore BUFFER-NAME if desktop.el has queued it lazily."
  (let ((args (seq-find (lambda (entry) (equal buffer-name (nth 2 entry)))
                        desktop-buffer-args-list)))
    (when args
      (setq desktop-buffer-args-list (delq args desktop-buffer-args-list))
      (apply #'desktop-create-buffer args)
      (get-buffer buffer-name))))

(defun tarutyyyne-workspace--ensure-ghostel (tab)
  "Return TAB's Ghostel buffer, creating it and attaching to Herdr if needed."
  (pcase-let* ((`(,_id ,session ,_main-name ,ghostel-name)
                (tarutyyyne-workspace--initialize-tab tab))
               (buffer (or (get-buffer ghostel-name)
                           (tarutyyyne-workspace--restore-pending-ghostel ghostel-name))))
    (unless (and buffer
                 (with-current-buffer buffer (derived-mode-p 'ghostel-mode)))
      (setq buffer (ghostel-create ghostel-name)))
    (tarutyyyne-workspace--send-herdr buffer session)
    buffer))

(defun tarutyyyne-workspace--workspace-for-ghostel (buffer-name)
  "Return the tab metadata associated with Ghostel BUFFER-NAME, if any."
  (catch 'workspace
    (dolist (frame (frame-list))
      (dolist (tab (tab-bar-tabs frame))
        (when (equal buffer-name
                     (alist-get tarutyyyne-workspace--ghostel-key tab))
          (throw 'workspace tab))))))

(defun tarutyyyne-workspace--desktop-buffer-pending-p (buffer-name)
  "Return non-nil when desktop.el still has BUFFER-NAME queued lazily."
  (seq-some (lambda (args) (equal buffer-name (nth 2 args)))
            desktop-buffer-args-list))

(defun tarutyyyne-workspace--restore-ghostel-advice (original &rest args)
  "Reconnect a lazily restored Ghostel buffer to its workspace session."
  (let ((buffer (apply original args)))
    (when (buffer-live-p buffer)
      (when-let* ((tab (tarutyyyne-workspace--workspace-for-ghostel
                        (buffer-name buffer)))
                  (session (alist-get tarutyyyne-workspace--session-key tab)))
        (tarutyyyne-workspace--send-herdr buffer session)))
    buffer))

(defun tarutyyyne-workspace--left-window (&optional frame)
  "Return the left side window on FRAME, if present."
  (seq-find (lambda (window)
              (and (eq (window-parameter window 'window-side) 'left)
                   (not (window-minibuffer-p window))))
            (window-list frame nil)))

(defun tarutyyyne-workspace--make-fixed-layout (frame main-buffer ghostel-buffer)
  "Create the configured two-pane layout on FRAME for the supplied buffers."
  (with-selected-frame frame
    (let ((main-window (window-main-window frame)))
      (select-window main-window)
      (delete-other-windows main-window)
      (set-window-buffer main-window main-buffer)
      (let ((ghostel-window
             (display-buffer
              ghostel-buffer
              '((display-buffer-in-side-window)
                (side . left)
                (slot . 0)
                (window-width . 0.5)))))
        (set-window-dedicated-p ghostel-window t))
      (select-window main-window)
      (set-window-parameter main-window 'memorandum-main-window t)
      (setq memorandum-main-window main-window)
      (puthash frame (current-window-configuration)
               tarutyyyne-workspace--frame-layouts))))

(defun tarutyyyne-workspace--apply-tab (frame tab)
  "Apply TAB's independent buffers to the common layout on FRAME."
  (pcase-let* ((`(,_id ,_session ,main-name ,_ghostel-name)
                (tarutyyyne-workspace--initialize-tab tab))
               (main-buffer (or (get-buffer main-name)
                                (when-let* ((file (alist-get
                                                  tarutyyyne-workspace--main-file-key
                                                  tab)))
                                  (find-file-noselect file))
                                (get-buffer-create main-name)))
               (ghostel-buffer (tarutyyyne-workspace--ensure-ghostel tab))
               (layout (gethash frame tarutyyyne-workspace--frame-layouts)))
    (unless layout
      (if (tarutyyyne-workspace--left-window frame)
          (puthash frame (with-selected-frame frame (current-window-configuration))
                   tarutyyyne-workspace--frame-layouts)
        (tarutyyyne-workspace--make-fixed-layout frame main-buffer ghostel-buffer))
      (setq layout (gethash frame tarutyyyne-workspace--frame-layouts)))
    (when layout
      (with-selected-frame frame
        (set-window-configuration layout nil t)
        (let ((main-window (window-main-window frame))
              (ghostel-window (tarutyyyne-workspace--left-window frame)))
          (when (window-live-p main-window)
            (set-window-buffer main-window main-buffer)
            (set-window-parameter main-window 'memorandum-main-window t)
            (setq memorandum-main-window main-window))
          (when (window-live-p ghostel-window)
            (set-window-dedicated-p ghostel-window nil)
            (set-window-buffer ghostel-window ghostel-buffer)
            (set-window-dedicated-p ghostel-window t)))))))

(defun tarutyyyne-workspace--save-current-tab (&rest _)
  "Record the visible pane buffers before `tab-bar' saves a tab."
  (let* ((frame (selected-frame))
         (tab (tarutyyyne-workspace--current-tab frame))
         (main-window (window-main-window frame)))
    (when tab
      (when (window-live-p main-window)
        (tarutyyyne-workspace--set-tab-parameter
         tab tarutyyyne-workspace--main-key
         (buffer-name (window-buffer main-window))))
      (when (window-live-p main-window)
        (tarutyyyne-workspace--set-tab-parameter
         tab tarutyyyne-workspace--main-file-key
         (buffer-local-value 'buffer-file-name
                             (window-buffer main-window))))
      (tab-bar-tabs-set (tab-bar-tabs frame)))))

(defun tarutyyyne-workspace--tab-opened (tab)
  "Initialize a new independent client for TAB, sharing Herdr's session."
  (let ((initial (and (not tarutyyyne-workspace--fresh-frame)
                      (= (length (tab-bar-tabs)) 1)
                      (not (gethash (selected-frame)
                                    tarutyyyne-workspace--frame-layouts)))))
    (tarutyyyne-workspace--initialize-tab tab initial)
    (tarutyyyne-workspace--apply-tab (selected-frame) tab)))

(defun tarutyyyne-workspace--tab-selected (_previous tab)
  "Restore the shared layout and TAB's independent buffers."
  (tarutyyyne-workspace--apply-tab (selected-frame) tab))

(defun tarutyyyne-workspace--frame-ready (frame &optional fresh-client)
  "Initialize FRAME, creating a new Herdr client when FRESH-CLIENT is non-nil."
  (when (and (frame-live-p frame)
             (not (eq (frame-parameter frame 'minibuffer) 'only)))
    (let ((tarutyyyne-workspace--fresh-frame fresh-client))
      (with-selected-frame frame
        (let* ((tab (tarutyyyne-workspace--current-tab frame))
               (initial (and (not fresh-client)
                             (= (length (tab-bar-tabs frame)) 1)
                             (not (alist-get tarutyyyne-workspace--id-key tab)))))
          (pcase-let ((`(,_id ,_session ,main-name ,_ghostel-name)
                       (tarutyyyne-workspace--initialize-tab tab initial)))
            (let ((main-buffer (or (get-buffer main-name)
                                   (when-let* ((file (alist-get
                                                     tarutyyyne-workspace--main-file-key
                                                     tab)))
                                     (find-file-noselect file))
                                   (get-buffer-create main-name)))
                  (ghostel-buffer
                   (tarutyyyne-workspace--ensure-ghostel tab)))
              (unless (tarutyyyne-workspace--left-window frame)
                (tarutyyyne-workspace--make-fixed-layout
                 frame main-buffer ghostel-buffer))
              (unless (gethash frame tarutyyyne-workspace--frame-layouts)
                (puthash frame (current-window-configuration)
                         tarutyyyne-workspace--frame-layouts))
              (tarutyyyne-workspace--apply-tab frame tab))))))))

(defun tarutyyyne-workspace--restore-desktop ()
  "Reconnect every restored tab to the shared Herdr session."
  (dolist (frame (frame-list))
    (when (frame-live-p frame)
      (with-selected-frame frame
        (let* ((tabs (tab-bar-tabs frame))
               (active (assq 'current-tab tabs)))
          (dolist (tab tabs)
            (tarutyyyne-workspace--initialize-tab
             tab (and (eq tab active)
                      (not (alist-get tarutyyyne-workspace--id-key tab))))
            (let ((ghostel-name
                   (alist-get tarutyyyne-workspace--ghostel-key tab)))
              (unless (tarutyyyne-workspace--desktop-buffer-pending-p ghostel-name)
                (tarutyyyne-workspace--ensure-ghostel tab))))
          (tarutyyyne-workspace--frame-ready frame))))))

(advice-add 'ghostel-desktop-restore-buffer :around
            #'tarutyyyne-workspace--restore-ghostel-advice)
(advice-add 'tab-bar-select-tab :before #'tarutyyyne-workspace--save-current-tab)
(advice-add 'tab-bar-new-tab-to :before #'tarutyyyne-workspace--save-current-tab)
(add-hook 'tab-bar-tab-post-open-functions #'tarutyyyne-workspace--tab-opened)
(add-hook 'tab-bar-tab-post-select-functions #'tarutyyyne-workspace--tab-selected)
(add-hook 'desktop-after-read-hook #'tarutyyyne-workspace--restore-desktop)
(add-hook 'emacs-startup-hook
          (lambda () (tarutyyyne-workspace--frame-ready (selected-frame))))
(add-hook 'after-make-frame-functions
          (lambda (frame)
            (run-at-time 0.2 nil #'tarutyyyne-workspace--frame-ready frame t)))

(provide 'tarutyyyne-workspaces)
;;; workspaces.el ends here
