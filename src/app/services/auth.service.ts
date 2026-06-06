import {Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {BehaviorSubject, Observable, from, of} from 'rxjs';
import {switchMap, tap, catchError} from 'rxjs/operators';
import {initializeApp} from 'firebase/app';
import {getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User} from 'firebase/auth';
import {environment} from '../../environments/environment';

@Injectable({providedIn: 'root'})
export class AuthService {
  private auth;
  private isAdminSubject = new BehaviorSubject<boolean>(false);
  private userSubject = new BehaviorSubject<User | null>(null);
  private tokenSubject = new BehaviorSubject<string | null>(null);
  private ready = new BehaviorSubject<boolean>(false);

  isAdmin$ = this.isAdminSubject.asObservable();
  user$ = this.userSubject.asObservable();
  ready$ = this.ready.asObservable();

  constructor(private http: HttpClient) {
    const app = initializeApp(environment.firebase);
    this.auth = getAuth(app);

    onAuthStateChanged(this.auth, async (user) => {
      this.userSubject.next(user);
      if (user) {
        const token = await user.getIdToken();
        this.tokenSubject.next(token);
        this.verifyAdmin(token);
      } else {
        this.tokenSubject.next(null);
        this.isAdminSubject.next(false);
        this.ready.next(true);
      }
    });
  }

  private verifyAdmin(token: string) {
    this.http.post<{isAdmin: boolean; email: string}>(
      `${environment.apiUrl}/auth/verify`,
      {},
      {headers: {Authorization: `Bearer ${token}`}}
    ).subscribe({
      next: (res) => {
        this.isAdminSubject.next(res.isAdmin);
        this.ready.next(true);
      },
      error: () => {
        this.isAdminSubject.next(false);
        this.ready.next(true);
      }
    });
  }

  signIn(): Observable<boolean> {
    const provider = new GoogleAuthProvider();
    return from(signInWithPopup(this.auth, provider)).pipe(
      switchMap(async (result) => {
        const token = await result.user.getIdToken();
        this.tokenSubject.next(token);
        return token;
      }),
      switchMap((token) =>
        this.http.post<{isAdmin: boolean}>(`${environment.apiUrl}/auth/verify`, {}, {
          headers: {Authorization: `Bearer ${token}`}
        })
      ),
      tap((res: any) => {
        console.log('Auth verify response:', res);
        this.isAdminSubject.next(res.isAdmin);
      }),
      switchMap((res) => of(res.isAdmin)),
      catchError((err) => {
        console.error('Auth verify error:', err);
        return of(false);
      })
    );
  }

  signOutUser(): Observable<void> {
    return from(signOut(this.auth)).pipe(
      tap(() => {
        this.tokenSubject.next(null);
        this.isAdminSubject.next(false);
      })
    );
  }

  getToken(): string | null {
    return this.tokenSubject.value;
  }
}
